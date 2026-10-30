package com.maxsolch.shop.gift.app;

import com.maxsolch.shop.order.app.OrderSettings;
import com.maxsolch.shop.gift.domain.PromoReminder;
import com.maxsolch.shop.gift.infra.GiftReminderStore;
import com.maxsolch.shop.order.app.OrderLookup;
import com.maxsolch.shop.settings.app.SettingsService;
import lombok.extern.slf4j.Slf4j;
import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;

/**
 * "Your code from the case runs out soon": a bot DM {@code gift.promoReminderDays} before an unused
 * personal code of a gift case (a discount prize or a swap, source GIFT_CASE) expires, once per code.
 * Codes younger than that window are left alone (the reminder would follow the code itself). Respects
 * the days setting (0 = off) and the customer-DM switch {@code notify.customerStatus}; the order's chat
 * is where the code was announced, so the reminder goes there too.
 */
@Slf4j
@Component
public class GiftCasePromoReminderJob {

    static final int BATCH = 50;

    private final GiftReminderStore store;
    private final SettingsService settings;
    private final OrderLookup orders;
    private final GiftNotifier notifier;
    private final Clock clock;

    public GiftCasePromoReminderJob(GiftReminderStore store, SettingsService settings, OrderLookup orders,
                                    GiftNotifier notifier, Clock clock) {
        this.store = store;
        this.settings = settings;
        this.orders = orders;
        this.notifier = notifier;
        this.clock = clock;
    }

    @SchedulerLock(name = "GiftCasePromoReminderJob.run", lockAtMostFor = "PT15M", lockAtLeastFor = "PT5S")
    @Scheduled(fixedDelayString = "${app.gift.reminder-ms:1800000}", initialDelay = 480_000)
    public void run() {
        try {
            int sent = sendDue();
            if (sent > 0) {
                log.info("Sent {} case promo expiry reminder(s)", sent);
            }
        } catch (RuntimeException e) {
            log.warn("Case promo expiry reminder run failed: {}", e.toString());
        }
    }

    /** @return how many reminders went out */
    int sendDue() {
        if (!settings.get(OrderSettings.NOTIFY_CUSTOMER_STATUS, true)) {
            return 0;
        }
        int days = settings.get(GiftSettings.GIFT_PROMO_REMINDER_DAYS, 3);
        if (days <= 0) {
            return 0;
        }
        Instant now = clock.instant();
        Duration window = Duration.ofDays(days);
        int sent = 0;
        for (PromoReminder c : store.candidates(now, now.plus(window), now.minus(window), BATCH)) {
            // Claimed before sending: a second instance (or a retry) never DMs the same code twice.
            if (!store.claim(c.promoId(), now)) {
                continue;
            }
            var order = orders.find(c.orderId()).orElse(null);
            if (order != null && notifier.promoExpiring(order, c.code(), c.percent(), c.amountMinor(), c.expiresAt())) {
                sent++;
            }
        }
        return sent;
    }
}
