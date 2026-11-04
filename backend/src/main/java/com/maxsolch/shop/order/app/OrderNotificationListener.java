package com.maxsolch.shop.order.app;

import com.maxsolch.shop.order.domain.OrderEvents;

import com.maxsolch.shop.order.domain.Order;
import com.maxsolch.shop.order.domain.OrderMoney;
import com.maxsolch.shop.order.domain.OrderStatus;
import com.maxsolch.shop.order.infra.OrderRepository;
import com.maxsolch.shop.platform.jobs.Workers;
import jakarta.persistence.EntityManager;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.stereotype.Component;
import com.maxsolch.shop.platform.tx.OnCommitted;

import java.time.Duration;
import java.util.Objects;
import java.util.Optional;
import java.util.concurrent.Executor;
import java.util.concurrent.RejectedExecutionHandler;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.function.Consumer;

/**
 * Sends Telegram notifications once the order transaction has committed, off the request thread.
 *
 * <p>A handler only queues its work on one bounded worker ({@link Workers#bounded}): the customer's request never
 * waits for Telegram and holds no database connection while it is slow. When the queue is full the notification is
 * dropped with a log line (the seller's «Разослать» button and the next status change repair a missing card).
 *
 * <p>The worker reads the order with its lines in a short transaction of its own and works on the DETACHED copy:
 * Telegram takes seconds, and a managed copy would be flushed as an UPDATE of the whole row, undoing a payment,
 * status or tracking number that arrived meanwhile. What the notifiers learn (the ids of the order card and of the
 * «К ОТПРАВКЕ» card) is written back afterwards by targeted UPDATEs of those columns only.
 *
 * <p>Failures are contained: {@link OrderSellerNotifier} and {@link OrderCustomerNotifier} already swallow Telegram errors, and the
 * listener runs after commit, so nothing here can roll back the order the customer just placed.
 */
@Slf4j
@Component
public class OrderNotificationListener {

    static final int QUEUE_CAPACITY = 1_000;

    private final OrderRepository orderRepository;
    private final EntityManager entityManager;
    private final OrderSellerNotifier seller;
    private final OrderCustomerNotifier customer;
    private final TransactionTemplate newTx;
    private final Executor executor;

    /** The integration tests swap the {@code Workers} bean for one that runs this worker inline (they assert right after commit). */
    public static final String WORKER = "order-notify";

    @Autowired
    public OrderNotificationListener(OrderRepository orderRepository, EntityManager entityManager,
                                     OrderSellerNotifier seller, OrderCustomerNotifier customer,
                                     PlatformTransactionManager txManager, Workers workers) {
        this(orderRepository, entityManager, seller, customer, txManager,
                workers.bounded(WORKER, QUEUE_CAPACITY, new DropAndLog(), Duration.ofSeconds(5)));
    }

    OrderNotificationListener(OrderRepository orderRepository, EntityManager entityManager,
                              OrderSellerNotifier seller, OrderCustomerNotifier customer,
                              PlatformTransactionManager txManager, Executor executor) {
        this.orderRepository = orderRepository;
        this.entityManager = entityManager;
        this.seller = seller;
        this.customer = customer;
        // REQUIRES_NEW: run inline (tests), the publisher's finished transaction is still bound to the thread.
        this.newTx = new TransactionTemplate(txManager);
        this.newTx.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        this.executor = executor;
    }

    /** A full queue means Telegram has been slow for a long time: say so and drop, never block the request. */
    private static final class DropAndLog implements RejectedExecutionHandler {
        @Override
        public void rejectedExecution(Runnable r, ThreadPoolExecutor e) {
            log.warn("Order notification dropped: the queue of {} is full (Telegram is slow or down)", QUEUE_CAPACITY);
        }
    }

    @OnCommitted
    public void onCreated(OrderEvents.Created event) {
        withOrder(event.orderId(), order -> {
            seller.onNewOrder(order);
            // The replacement of an exchange is announced by onExchanged (one message, not two).
            if (order.getExchangeOfOrderId() == null) {
                customer.notifyCustomerStatus(order);
            }
        });
    }

    @OnCommitted
    public void onStatusChanged(OrderEvents.StatusChanged event) {
        withOrder(event.orderId(), order -> {
            seller.onStatusChanged(order);
            customer.notifyCustomerStatus(order);
            reconcileDispatch(order);
        });
    }

    @OnCommitted
    public void onExchanged(OrderEvents.Exchanged event) {
        withOrder(event.orderId(), order -> {
            // The channel card moves to the new status column; the seller's "К ОТПРАВКЕ" card
            // appears again only when the order goes straight to APPROVED.
            seller.onStatusChanged(order);
            reconcileDispatch(order);
            if (event.notifyCustomer()) {
                customer.notifyCustomerExchange(order, event.givenSummary());
            }
        });
    }

    @OnCommitted
    public void onMerged(OrderEvents.Merged event) {
        withOrder(event.sourceId(), source -> {
            seller.onStatusChanged(source);
            seller.removeDispatchCard(source);
        });
        withOrder(event.targetId(), target -> {
            seller.onStatusChanged(target);
            refreshDispatch(target);
            if (event.notifyCustomer()) {
                String from = com.maxsolch.shop.platform.util.UuidUtil.toString(event.sourceId());
                customer.notifyCustomerMerged(target, from == null ? "" : from.substring(0, 8));
            }
        });
    }

    @OnCommitted
    public void onReturned(OrderEvents.Returned event) {
        withOrder(event.orderId(), order -> {
            refreshDispatch(order);
            if (event.notifyCustomer()) {
                customer.notifyCustomerReturn(order, event.itemsSummary(), event.refundMinor());
            }
        });
    }

    @OnCommitted
    public void onGiftCasePromo(OrderEvents.GiftCasePromoIssued event) {
        withOrder(event.orderId(), order -> customer.notifyCustomerCasePromo(
                order, event.code(), event.percent(), event.amountMinor(), event.expiresAt()));
    }

    @OnCommitted
    public void onPaymentReceived(OrderEvents.PaymentReceived event) {
        withOrder(event.orderId(), order -> {
            seller.onPaymentReceived(order, event.amountMinor());
            customer.onPaymentReceived(order, event.amountMinor());
            refreshDispatch(order);
        });
    }

    @OnCommitted
    public void onEdited(OrderEvents.Edited event) {
        withOrder(event.orderId(), order -> {
            refreshDispatch(order);
            if (event.kind() == OrderEvents.EditKind.TRACKING
                    || event.kind() == OrderEvents.EditKind.DETAILS) {
                // The channel card prints the ТТН and the address — re-post it with the fix.
                seller.onStatusChanged(order);
            }
            if (!event.notifyCustomer()) {
                return;
            }
            customerNote(order, event).run();
        });
    }

    @OnCommitted
    public void onCancelRequested(OrderEvents.CancelRequested event) {
        withOrder(event.orderId(), seller::onCancelRequested);
    }

    @OnCommitted
    public void onCancelRequestResolved(OrderEvents.CancelRequestResolved event) {
        withOrder(event.orderId(), order -> customer.notifyCustomerCancelRequest(order, event.approved()));
    }

    @OnCommitted
    public void onChatMessage(OrderEvents.ChatMessagePosted event) {
        withOrder(event.orderId(), order -> {
            if (event.fromAdmin()) {
                customer.onAdminChatMessage(order, event.preview());
            } else {
                seller.onCustomerChatMessage(order, event.preview());
            }
        });
    }

    /** What the customer is told about an edit; a switch EXPRESSION, so a new {@code EditKind} cannot be forgotten. */
    private Runnable customerNote(Order order, OrderEvents.Edited event) {
        return switch (event.kind()) {
            case GIFT -> () -> customer.notifyCustomerGift(
                    order, event.productTitle(), event.variantName(), event.quantity());
            case GIFT_CASE -> () -> customer.notifyCustomerGiftCase(order);
            case DISCOUNT -> () -> {
                if (order.getDiscountMinor() > 0) {
                    customer.notifyCustomerDiscount(order);
                }
            };
            // A paid order that now costs more: TopUpNoticeJobs sends «Потрібна доплата» once the edits are over.
            case COMPOSITION -> () -> {
                if (OrderMoney.topUpNotice(order) == null) {
                    customer.notifyCustomerOrderChanged(order);
                }
            };
            case TRACKING -> () -> customer.notifyCustomerTracking(order);
            // dispatch card refresh only
            case DETAILS, SILENT -> () -> { };
        };
    }

    /**
     * The order changed status: newly approved orders belong in the seller's "К ОТПРАВКЕ" topic,
     * and leave it as soon as they ship / are delivered / are cancelled.
     */
    private void reconcileDispatch(Order order) {
        if (order.getStatus() == OrderStatus.APPROVED) {
            seller.syncDispatchCard(order);
        } else {
            seller.removeDispatchCard(order);
        }
    }

    /**
     * Refreshes an existing dispatch card after a change that is not a status change (payment, return,
     * edit, merge target). Unlike {@link #reconcileDispatch} it never removes the card of a non-APPROVED
     * order: the status change that took it out of APPROVED has already done that.
     */
    private void refreshDispatch(Order order) {
        if (order.getStatus() == OrderStatus.APPROVED) {
            seller.syncDispatchCard(order);
        }
    }

    private void withOrder(byte[] orderId, Consumer<Order> action) {
        executor.execute(() -> {
            try {
                run(orderId, action);
            } catch (RuntimeException e) {
                log.warn("Order notification failed: {}", e.getMessage(), e);
            }
        });
    }

    private void run(byte[] orderId, Consumer<Order> action) {
        Optional<Order> found = orderRepository.findWithItemsById(orderId);
        if (found.isEmpty()) {
            log.debug("Notification skipped: order no longer exists");
            return;
        }
        Order order = found.get();
        entityManager.detach(order);
        Long chat = order.getNotifyChatId();
        Integer thread = order.getNotifyThreadId();
        Integer message = order.getNotifyMessageId();
        Integer dispatch = order.getDispatchMessageId();
        action.accept(order);
        boolean cardMoved = !Objects.equals(chat, order.getNotifyChatId())
                || !Objects.equals(thread, order.getNotifyThreadId())
                || !Objects.equals(message, order.getNotifyMessageId());
        boolean dispatchMoved = !Objects.equals(dispatch, order.getDispatchMessageId());
        if (cardMoved || dispatchMoved) {
            newTx.executeWithoutResult(s -> {
                if (cardMoved) {
                    orderRepository.updateSellerCard(order.getId(), order.getNotifyChatId(),
                            order.getNotifyThreadId(), order.getNotifyMessageId());
                }
                if (dispatchMoved) {
                    orderRepository.updateDispatchMessageId(order.getId(), order.getDispatchMessageId());
                }
            });
        }
    }
}
