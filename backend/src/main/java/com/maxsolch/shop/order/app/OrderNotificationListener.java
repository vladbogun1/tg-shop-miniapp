package com.maxsolch.shop.order.app;

import com.maxsolch.shop.order.domain.Order;
import com.maxsolch.shop.order.domain.OrderStatus;
import com.maxsolch.shop.order.infra.OrderRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import com.maxsolch.shop.platform.tx.OnCommitted;

import java.util.function.Consumer;

/**
 * Sends Telegram notifications once the order transaction has committed.
 *
 * <p>Every handler opens its own transaction ({@code REQUIRES_NEW}) and re-reads the order, for two
 * reasons: the entity from the original transaction is detached by now, and the notification calls
 * write message ids back onto the order ({@code notify_message_id}, {@code dispatch_message_id}) —
 * those need a live persistence context to be flushed.
 *
 * <p>Failures are contained: {@link OrderSellerNotifier} and {@link OrderCustomerNotifier} already swallow Telegram errors, and the
 * listener runs after commit, so nothing here can roll back the order the customer just placed.
 */
@Slf4j
@Component
public class OrderNotificationListener {

    private final OrderRepository orderRepository;
    private final OrderSellerNotifier seller;
    private final OrderCustomerNotifier customer;

    public OrderNotificationListener(OrderRepository orderRepository,
                                     OrderSellerNotifier seller, OrderCustomerNotifier customer) {
        this.orderRepository = orderRepository;
        this.seller = seller;
        this.customer = customer;
    }

    @OnCommitted
    @Transactional(propagation = Propagation.REQUIRES_NEW)
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
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void onStatusChanged(OrderEvents.StatusChanged event) {
        withOrder(event.orderId(), order -> {
            seller.onStatusChanged(order);
            customer.notifyCustomerStatus(order);
            reconcileDispatch(order);
        });
    }

    @OnCommitted
    @Transactional(propagation = Propagation.REQUIRES_NEW)
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
    @Transactional(propagation = Propagation.REQUIRES_NEW)
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
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void onReturned(OrderEvents.Returned event) {
        withOrder(event.orderId(), order -> {
            refreshDispatch(order);
            if (event.notifyCustomer()) {
                customer.notifyCustomerReturn(order, event.itemsSummary(), event.refundMinor());
            }
        });
    }

    @OnCommitted
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void onGiftCasePromo(OrderEvents.GiftCasePromo event) {
        withOrder(event.orderId(), order -> customer.notifyCustomerCasePromo(
                order, event.code(), event.percent(), event.amountMinor(), event.expiresAt()));
    }

    @OnCommitted
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void onPaymentReceived(OrderEvents.PaymentReceived event) {
        withOrder(event.orderId(), order -> {
            seller.onPaymentReceived(order, event.amountMinor());
            customer.onPaymentReceived(order, event.amountMinor());
            refreshDispatch(order);
        });
    }

    @OnCommitted
    @Transactional(propagation = Propagation.REQUIRES_NEW)
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
            switch (event.kind()) {
                case GIFT -> customer.notifyCustomerGift(
                        order, event.productTitle(), event.variantName(), event.quantity());
                case GIFT_CASE -> customer.notifyCustomerGiftCase(order);
                case DISCOUNT -> {
                    if (order.getDiscountMinor() > 0) {
                        customer.notifyCustomerDiscount(order);
                    }
                }
                case COMPOSITION -> customer.notifyCustomerOrderChanged(order);
                case TRACKING -> customer.notifyCustomerTracking(order);
                case DETAILS, SILENT -> {
                    // dispatch card refresh only
                }
            }
        });
    }

    @OnCommitted
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void onCancelRequested(OrderEvents.CancelRequested event) {
        withOrder(event.orderId(), seller::onCancelRequested);
    }

    @OnCommitted
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void onCancelRequestResolved(OrderEvents.CancelRequestResolved event) {
        withOrder(event.orderId(), order -> customer.notifyCustomerCancelRequest(order, event.approved()));
    }

    @OnCommitted
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void onChatMessage(OrderEvents.ChatMessage event) {
        withOrder(event.orderId(), order -> {
            if (event.fromAdmin()) {
                customer.onAdminChatMessage(order, event.preview());
            } else {
                seller.onCustomerChatMessage(order, event.preview());
            }
        });
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
        orderRepository.findById(orderId).ifPresentOrElse(
                action,
                () -> log.debug("Notification skipped: order no longer exists"));
    }
}
