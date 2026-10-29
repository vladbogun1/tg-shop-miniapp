package com.maxsolch.shop.tg;

import com.maxsolch.shop.order.domain.Order;
import com.maxsolch.shop.order.domain.OrderStatus;
import com.maxsolch.shop.media.app.ImageStorageService;
import com.maxsolch.shop.order.infra.OrderRepository;
import com.maxsolch.shop.order.app.OrderEvents;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.event.TransactionalEventListener;

import java.util.function.Consumer;

/**
 * Sends Telegram notifications once the order transaction has committed.
 *
 * <p>Every handler opens its own transaction ({@code REQUIRES_NEW}) and re-reads the order, for two
 * reasons: the entity from the original transaction is detached by now, and the notification calls
 * write message ids back onto the order ({@code notify_message_id}, {@code dispatch_message_id}) —
 * those need a live persistence context to be flushed.
 *
 * <p>Failures are contained: {@link NotificationService} already swallows Telegram errors, and the
 * listener runs after commit, so nothing here can roll back the order the customer just placed.
 */
@Slf4j
@Component
public class OrderNotificationListener {

    private final OrderRepository orderRepository;
    private final NotificationService notificationService;
    private final ImageStorageService imageStorageService;

    public OrderNotificationListener(OrderRepository orderRepository,
                                     NotificationService notificationService,
                                     ImageStorageService imageStorageService) {
        this.orderRepository = orderRepository;
        this.notificationService = notificationService;
        this.imageStorageService = imageStorageService;
    }

    @TransactionalEventListener
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void onCreated(OrderEvents.Created event) {
        withOrder(event.orderId(), order -> {
            notificationService.onNewOrder(order);
            // The replacement of an exchange is announced by onExchanged (one message, not two).
            if (order.getExchangeOfOrderId() == null) {
                notificationService.notifyCustomerStatus(order);
            }
        });
    }

    @TransactionalEventListener
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void onStatusChanged(OrderEvents.StatusChanged event) {
        withOrder(event.orderId(), order -> {
            notificationService.onStatusChanged(order);
            notificationService.notifyCustomerStatus(order);
            reconcileDispatch(order);
        });
    }

    @TransactionalEventListener
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void onExchanged(OrderEvents.Exchanged event) {
        withOrder(event.orderId(), order -> {
            // The channel card moves to the new status column; the seller's "К ОТПРАВКЕ" card
            // appears again only when the order goes straight to APPROVED.
            notificationService.onStatusChanged(order);
            reconcileDispatch(order);
            if (event.notifyCustomer()) {
                notificationService.notifyCustomerExchange(order, event.givenSummary());
            }
        });
    }

    @TransactionalEventListener
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void onMerged(OrderEvents.Merged event) {
        withOrder(event.sourceId(), source -> {
            notificationService.onStatusChanged(source);
            notificationService.removeDispatchCard(source);
        });
        withOrder(event.targetId(), target -> {
            notificationService.onStatusChanged(target);
            refreshDispatch(target);
            if (event.notifyCustomer()) {
                String from = com.maxsolch.shop.platform.util.UuidUtil.toString(event.sourceId());
                notificationService.notifyCustomerMerged(target, from == null ? "" : from.substring(0, 8));
            }
        });
    }

    @TransactionalEventListener
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void onReturned(OrderEvents.Returned event) {
        withOrder(event.orderId(), order -> {
            refreshDispatch(order);
            if (event.notifyCustomer()) {
                notificationService.notifyCustomerReturn(order, event.itemsSummary(), event.refundMinor());
            }
        });
    }

    @TransactionalEventListener
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void onGiftCasePromo(OrderEvents.GiftCasePromo event) {
        withOrder(event.orderId(), order -> notificationService.notifyCustomerCasePromo(
                order, event.code(), event.percent(), event.amountMinor(), event.expiresAt()));
    }

    @TransactionalEventListener
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void onPaymentReceived(OrderEvents.PaymentReceived event) {
        withOrder(event.orderId(), order -> {
            notificationService.onPaymentReceived(order, event.amountMinor());
            refreshDispatch(order);
        });
    }

    @TransactionalEventListener
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void onEdited(OrderEvents.Edited event) {
        withOrder(event.orderId(), order -> {
            refreshDispatch(order);
            if (event.kind() == OrderEvents.EditKind.TRACKING
                    || event.kind() == OrderEvents.EditKind.DETAILS) {
                // The channel card prints the ТТН and the address — re-post it with the fix.
                notificationService.onStatusChanged(order);
            }
            if (!event.notifyCustomer()) {
                return;
            }
            switch (event.kind()) {
                case GIFT -> notificationService.notifyCustomerGift(
                        order, event.productTitle(), event.variantName(), event.quantity());
                case GIFT_CASE -> notificationService.notifyCustomerGiftCase(order);
                case DISCOUNT -> {
                    if (order.getDiscountMinor() > 0) {
                        notificationService.notifyCustomerDiscount(order);
                    }
                }
                case COMPOSITION -> notificationService.notifyCustomerOrderChanged(order);
                case TRACKING -> notificationService.notifyCustomerTracking(order);
                case DETAILS, SILENT -> {
                    // dispatch card refresh only
                }
            }
        });
    }

    @TransactionalEventListener
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void onCancelRequested(OrderEvents.CancelRequested event) {
        withOrder(event.orderId(), notificationService::onCancelRequested);
    }

    @TransactionalEventListener
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void onCancelRequestResolved(OrderEvents.CancelRequestResolved event) {
        withOrder(event.orderId(), order -> notificationService.notifyCustomerCancelRequest(order, event.approved()));
    }

    @TransactionalEventListener
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void onChatMessage(OrderEvents.ChatMessage event) {
        withOrder(event.orderId(), order -> {
            if (event.fromAdmin()) {
                notificationService.onAdminChatMessage(order, event.preview());
            } else {
                notificationService.onCustomerChatMessage(order, event.preview());
            }
        });
    }

    /**
     * An order was deleted: take its dispatch card out of the seller topic and delete the chat
     * attachments from storage. After the commit only — a rolled-back delete must not have lost
     * its files — and with no database work at all (the row is gone).
     */
    @TransactionalEventListener
    public void onDeleted(OrderEvents.Deleted event) {
        notificationService.removeDispatchCard(event.dispatchMessageId());
        if (event.attachmentKeys() != null) {
            event.attachmentKeys().forEach(imageStorageService::deleteQuietly);
        }
    }

    /**
     * The order changed status: newly approved orders belong in the seller's "К ОТПРАВКЕ" topic,
     * and leave it as soon as they ship / are delivered / are cancelled.
     */
    private void reconcileDispatch(Order order) {
        if (order.getStatus() == OrderStatus.APPROVED) {
            notificationService.syncDispatchCard(order);
        } else {
            notificationService.removeDispatchCard(order);
        }
    }

    /**
     * Refreshes an existing dispatch card after a change that is not a status change (payment, return,
     * edit, merge target). Unlike {@link #reconcileDispatch} it never removes the card of a non-APPROVED
     * order: the status change that took it out of APPROVED has already done that.
     */
    private void refreshDispatch(Order order) {
        if (order.getStatus() == OrderStatus.APPROVED) {
            notificationService.syncDispatchCard(order);
        }
    }

    private void withOrder(byte[] orderId, Consumer<Order> action) {
        orderRepository.findById(orderId).ifPresentOrElse(
                action,
                () -> log.debug("Notification skipped: order no longer exists"));
    }
}
