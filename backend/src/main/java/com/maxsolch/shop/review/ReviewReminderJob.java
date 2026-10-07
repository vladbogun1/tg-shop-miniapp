package com.maxsolch.shop.review;

import com.maxsolch.shop.settings.SettingsRegistry;
import com.maxsolch.shop.settings.SettingsService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;

/**
 * "Leave a review — get −5%": a bot DM {@code reviews.reminderDays} after delivery, once per order,
 * only while something in the order is still unreviewed. Respects {@code reviews.enabled},
 * {@code reviews.reminderDays = 0} (off) and the customer-DM switch {@code notify.customerStatus}.
 */
@Slf4j
@Component
public class ReviewReminderJob {

    static final int BATCH = 50;

    private final ReviewStore store;
    private final SettingsService settings;
    private final ReviewNotifier notifier;
    private Clock clock = Clock.systemUTC();

    public ReviewReminderJob(ReviewStore store, SettingsService settings, ReviewNotifier notifier) {
        this.store = store;
        this.settings = settings;
        this.notifier = notifier;
    }

    void setClock(Clock clock) {
        this.clock = clock;
    }

    @Scheduled(fixedDelayString = "${app.reviews.reminder-ms:1800000}", initialDelay = 300_000)
    public void run() {
        try {
            int sent = sendDue();
            if (sent > 0) {
                log.info("Sent {} review reminder(s)", sent);
            }
        } catch (RuntimeException e) {
            log.warn("Review reminder run failed: {}", e.toString());
        }
    }

    /** @return how many reminders went out */
    int sendDue() {
        if (!settings.get(SettingsRegistry.REVIEWS_ENABLED, true)
                || !settings.get(SettingsRegistry.NOTIFY_CUSTOMER_STATUS, true)
                || !notifier.enabled()) {
            return 0;
        }
        int days = settings.get(SettingsRegistry.REVIEWS_REMINDER_DAYS, 2);
        if (days <= 0) {
            return 0;
        }
        Instant now = clock.instant();
        Instant deliveredTo = now.minus(Duration.ofDays(days));
        Instant deliveredFrom = deliveredTo.minus(Duration.ofDays(ReviewRules.REMINDER_WINDOW_DAYS));
        int bonusPercent = settings.get(SettingsRegistry.REVIEWS_BONUS_PERCENT, 5);
        List<ReviewStore.ReminderCandidate> candidates = store.reminderCandidates(deliveredFrom, deliveredTo, BATCH);
        int sent = 0;
        for (ReviewStore.ReminderCandidate c : candidates) {
            if (!ReviewRules.reminderDue(com.maxsolch.shop.domain.OrderStatus.DELIVERED, c.deliveredAt(), null,
                    c.tgUserId(), c.hasPendingLines(), now, days)) {
                continue;
            }
            // Claimed before sending: a second instance (or a retry) never DMs the same order twice.
            if (!store.claimReminder(c.orderId(), now)) {
                continue;
            }
            if (notifier.reminder(c.tgUserId(), c.orderId(), bonusPercent)) {
                sent++;
            }
        }
        return sent;
    }
}
