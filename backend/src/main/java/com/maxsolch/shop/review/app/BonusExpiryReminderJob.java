package com.maxsolch.shop.review.app;

import com.maxsolch.shop.order.app.OrderSettings;
import com.maxsolch.shop.customer.app.Customers;
import com.maxsolch.shop.promo.app.PromoExpiry;
import com.maxsolch.shop.promo.domain.ExpiringPromo;
import com.maxsolch.shop.promo.domain.PromoCode;

import com.maxsolch.shop.settings.app.SettingsService;
import lombok.extern.slf4j.Slf4j;
import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;

/**
 * "Your review bonus runs out soon": a bot DM {@code reviews.bonusExpiryReminderDays} before an unused
 * review bonus expires, once per code. Codes younger than that window are left alone (with a short
 * validity the reminder would arrive right after the bonus itself). Respects {@code reviews.enabled},
 * the days setting (0 = off) and the customer-DM switch {@code notify.customerStatus}.
 */
@Slf4j
@Component
public class BonusExpiryReminderJob {

    static final int BATCH = 50;

    private final PromoExpiry promos;
    private final Customers customers;
    private final SettingsService settings;
    private final ReviewNotifier notifier;
    private final Clock clock;

    public BonusExpiryReminderJob(PromoExpiry promos, Customers customers, SettingsService settings, ReviewNotifier notifier, Clock clock) {
        this.promos = promos;
        this.customers = customers;
        this.settings = settings;
        this.notifier = notifier;
        this.clock = clock;
    }

    @SchedulerLock(name = "BonusExpiryReminderJob.run", lockAtMostFor = "PT15M", lockAtLeastFor = "PT5S")
    @Scheduled(fixedDelayString = "${app.reviews.reminder-ms:1800000}", initialDelay = 420_000)
    public void run() {
        try {
            int sent = sendDue();
            if (sent > 0) {
                log.info("Sent {} bonus expiry reminder(s)", sent);
            }
        } catch (RuntimeException e) {
            log.warn("Bonus expiry reminder run failed: {}", e.toString());
        }
    }

    /** @return how many reminders went out */
    int sendDue() {
        if (!settings.get(ReviewSettings.REVIEWS_ENABLED, true)
                || !settings.get(OrderSettings.NOTIFY_CUSTOMER_STATUS, true)
                || !notifier.enabled()) {
            return 0;
        }
        int days = settings.get(ReviewSettings.REVIEWS_BONUS_EXPIRY_REMINDER_DAYS, 3);
        if (days <= 0) {
            return 0;
        }
        Instant now = clock.instant();
        Duration window = Duration.ofDays(days);
        int sent = 0;
        for (ExpiringPromo c : promos.expiring(PromoCode.SOURCE_REVIEW_BONUS, now, now.plus(window), now.minus(window),
                BATCH, this::reachable)) {
            // Claimed before sending, so a second instance never DMs the same code twice; given back when the
            // send did not go out, so a Telegram hiccup does not lose the reminder for good.
            if (!promos.claimReminder(c.promoId(), now)) {
                continue;
            }
            boolean delivered = false;
            try {
                delivered = notifier.bonusExpiring(c.ownerUserId(), c.code(), c.percent(), c.maxDiscountMinor(), c.expiresAt());
            } finally {
                if (!delivered) {
                    promos.releaseReminder(c.promoId(), now);
                }
            }
            if (delivered) {
                sent++;
            }
        }
        return sent;
    }

    /** A personal code of a customer with a Telegram chat who has not blocked the bot. */
    private boolean reachable(ExpiringPromo c) {
        return c.ownerUserId() != null && c.ownerUserId() > 0
                && customers.findById(c.ownerUserId()).map(u -> !u.isBotBlocked()).orElse(true);
    }
}
