package com.maxsolch.shop.review.app;

import com.maxsolch.shop.order.app.OrderSettings;
import com.maxsolch.shop.review.domain.ReviewRules;
import com.maxsolch.shop.customer.app.Customers;
import com.maxsolch.shop.order.app.OrderReviewMarks;
import com.maxsolch.shop.order.domain.DeliveredOrder;
import com.maxsolch.shop.review.infra.ProductReviewRepository;

import com.maxsolch.shop.settings.app.SettingsService;
import lombok.extern.slf4j.Slf4j;
import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashSet;
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
    /** Pages read before giving up: orders the checks skip must not hide the next ones, but the scan is bounded. */
    static final int MAX_PAGES = 20;

    private final OrderReviewMarks orders;
    private final ProductReviewRepository reviews;
    private final Customers customers;
    private final SettingsService settings;
    private final ReviewNotifier notifier;
    private final Clock clock;

    public ReviewReminderJob(OrderReviewMarks orders, ProductReviewRepository reviews, Customers customers,
                             SettingsService settings, ReviewNotifier notifier, Clock clock) {
        this.orders = orders;
        this.reviews = reviews;
        this.customers = customers;
        this.settings = settings;
        this.notifier = notifier;
        this.clock = clock;
    }

    @SchedulerLock(name = "ReviewReminderJob.run", lockAtMostFor = "PT15M", lockAtLeastFor = "PT5S")
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
        if (!settings.get(ReviewSettings.REVIEWS_ENABLED, true)
                || !settings.get(OrderSettings.NOTIFY_CUSTOMER_STATUS, true)
                || !notifier.enabled()) {
            return 0;
        }
        int days = settings.get(ReviewSettings.REVIEWS_REMINDER_DAYS, 2);
        if (days <= 0) {
            return 0;
        }
        Instant now = clock.instant();
        Instant deliveredTo = now.minus(Duration.ofDays(days));
        Instant deliveredFrom = deliveredTo.minus(Duration.ofDays(ReviewRules.REMINDER_WINDOW_DAYS));
        int bonusPercent = settings.get(ReviewSettings.REVIEWS_BONUS_PERCENT, 5);
        long bonusMax = ReviewRules.bonusMaxMinor(settings.get(ReviewSettings.REVIEWS_BONUS_MAX_UAH, 100));
        List<DeliveredOrder> candidates = candidates(deliveredFrom, deliveredTo);
        int sent = 0;
        for (DeliveredOrder c : candidates) {
            if (!ReviewRules.reminderDue(com.maxsolch.shop.order.domain.OrderStatus.DELIVERED, c.deliveredAt(), null,
                    c.tgUserId(), true, now, days)) {
                continue;
            }
            // Claimed before sending: a second instance (or a retry) never DMs the same order twice.
            if (!orders.claimReminder(c.orderId(), now)) {
                continue;
            }
            if (notifier.reminder(c.tgUserId(), c.orderId(), bonusPercent, bonusMax)) {
                sent++;
            }
        }
        return sent;
    }

    /**
     * Delivered orders in the window with a line still to review and a customer who has not blocked the bot, oldest
     * first, up to {@link #BATCH}. Orders that fail those checks are read past, so they never hide the ones behind them.
     */
    private List<DeliveredOrder> candidates(Instant deliveredFrom, Instant deliveredTo) {
        List<DeliveredOrder> out = new ArrayList<>();
        for (int page = 0; page < MAX_PAGES && out.size() < BATCH; page++) {
            List<DeliveredOrder> batch = orders.deliveredWithoutReminder(deliveredFrom, deliveredTo, BATCH, page * BATCH);
            for (DeliveredOrder o : batch) {
                if (out.size() < BATCH && hasLineToReview(o) && customers.findById(o.tgUserId())
                        .map(u -> !u.isBotBlocked()).orElse(true)) {
                    out.add(o);
                }
            }
            if (batch.size() < BATCH) {
                break;
            }
        }
        return out;
    }

    private boolean hasLineToReview(DeliveredOrder o) {
        return !new HashSet<>(reviews.reviewedItemIds(o.itemIds())).containsAll(o.itemIds());
    }
}
