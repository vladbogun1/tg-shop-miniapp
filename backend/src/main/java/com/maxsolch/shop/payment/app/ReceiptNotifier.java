package com.maxsolch.shop.payment.app;

import com.maxsolch.shop.order.domain.Order;
import com.maxsolch.shop.payment.domain.ReceiptKind;
import com.maxsolch.shop.notification.app.NotificationService;
import org.springframework.stereotype.Component;

/**
 * Sends a receipt to the customer in the bot. The one place where payment talks to the Telegram module, so the
 * receipt job depends on this port-like class and not on {@code NotificationService}.
 */
@Component
public class ReceiptNotifier {

    /** What happened to one send: delivered, the customer blocked the bot, or it failed (retry later). */
    public enum Delivery { SENT, BLOCKED, FAILED }

    private final NotificationService notifications;

    public ReceiptNotifier(NotificationService notifications) {
        this.notifications = notifications;
    }

    /** A bot token is configured: worth preparing receipts at all. */
    public boolean isBotEnabled() {
        return notifications.isBotEnabled();
    }

    public Delivery send(Order order, byte[] pdf, ReceiptKind kind, String taxUrl) {
        return switch (notifications.sendReceipt(order, pdf, kind, taxUrl)) {
            case SENT -> Delivery.SENT;
            case BLOCKED -> Delivery.BLOCKED;
            case FAILED -> Delivery.FAILED;
        };
    }
}
