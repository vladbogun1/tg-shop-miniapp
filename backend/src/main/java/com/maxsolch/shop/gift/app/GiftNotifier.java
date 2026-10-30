package com.maxsolch.shop.gift.app;

import com.maxsolch.shop.order.domain.Order;
import com.maxsolch.shop.notification.app.NotificationService;
import org.springframework.stereotype.Component;

import java.time.Instant;

/** What the gift tells the customer in the bot: the one door from the gift module to Telegram. */
@Component
public class GiftNotifier {

    private final NotificationService notifications;

    public GiftNotifier(NotificationService notifications) {
        this.notifications = notifications;
    }

    /** "Your code from the case runs out on …", to the order's chat; false when it was not delivered. */
    public boolean promoExpiring(Order order, String code, int percent, long amountMinor, Instant expiresAt) {
        return notifications.notifyCustomerCasePromoExpiring(order, code, percent, amountMinor, expiresAt);
    }
}
