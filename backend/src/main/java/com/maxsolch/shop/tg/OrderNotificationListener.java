package com.maxsolch.shop.tg;

import com.maxsolch.shop.domain.Order;
import com.maxsolch.shop.domain.OrderStatus;
import com.maxsolch.shop.media.ImageStorageService;
import com.maxsolch.shop.repository.OrderRepository;
import com.maxsolch.shop.service.OrderEvents;
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
            notificationService.notifyCustomerStatus(order);
        });
    }

    @TransactionalEventListener
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void onStatusChanged(OrderEvents.StatusChanged event) {
        withOrder(event.orderId(), order -> {
            notificationService.onStatusChanged(order);
            notificationService.notifyCustomerStatus(order);
            if (order.getStatus() == OrderStatus.APPROVED) {
                // Newly approved orders belong in the seller's "К ОТПРАВКЕ" topic...
                notificationService.syncDispatchCard(order);
            } else {
                // ...and leave it as soon as they ship / are delivered / are cancelled.
                notificationService.removeDispatchCard(order);
            }
        });
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

    /** The seller's dispatch card only exists while the order is awaiting shipment. */
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
