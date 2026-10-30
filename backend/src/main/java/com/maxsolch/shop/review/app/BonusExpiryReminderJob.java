package com.maxsolch.shop.review.app;

import com.maxsolch.shop.review.infra.ReviewStore;

import com.maxsolch.shop.platform.settings.SettingsRegistry;
import com.maxsolch.shop.platform.settings.SettingsService;
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

    private final ReviewStore store;
    private final SettingsService settings;
    private final ReviewNotifier notifier;
    private final Clock clock;

    public BonusExpiryReminderJob(ReviewStore store, SettingsService settings, ReviewNotifier notifier, Clock clock) {
        this.store = store;
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
        if (!settings.get(SettingsRegistry.REVIEWS_ENABLED, true)
                || !settings.get(SettingsRegistry.NOTIFY_CUSTOMER_STATUS, true)
                || !notifier.enabled()) {
            return 0;
        }
        int days = settings.get(SettingsRegistry.REVIEWS_BONUS_EXPIRY_REMINDER_DAYS, 3);
        if (days <= 0) {
            return 0;
        }
        Instant now = clock.instant();
        Duration window = Duration.ofDays(days);
        int sent = 0;
        for (ReviewStore.BonusExpiryCandidate c
                : store.bonusExpiryCandidates(now, now.plus(window), now.minus(window), BATCH)) {
            // Claimed before sending: a second instance (or a retry) never DMs the same code twice.
            if (!store.claimBonusExpiryReminder(c.promoId(), now)) {
                continue;
            }
            if (notifier.bonusExpiring(c.tgUserId(), c.code(), c.percent(), c.maxDiscountMinor(), c.expiresAt())) {
                sent++;
            }
        }
        return sent;
    }
}
