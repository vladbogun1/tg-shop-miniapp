package com.maxsolch.shop.review.app;

import com.maxsolch.shop.customer.app.Customers;
import com.maxsolch.shop.customer.domain.User;
import com.maxsolch.shop.order.app.OrderReviewMarks;
import com.maxsolch.shop.order.app.OrderSettings;
import com.maxsolch.shop.order.domain.DeliveredOrder;
import com.maxsolch.shop.review.domain.ReviewRules;
import com.maxsolch.shop.review.infra.ProductReviewRepository;
import com.maxsolch.shop.settings.app.SettingsService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** "Leave a review" reminders: which orders, once each, and only when switched on. */
@ExtendWith(MockitoExtension.class)
class ReviewReminderJobTest {

    private static final Instant NOW = Instant.parse("2026-10-05T12:00:00Z");

    @Mock
    OrderReviewMarks orders;
    @Mock
    ProductReviewRepository reviews;
    @Mock
    Customers customers;
    @Mock
    SettingsService settings;
    @Mock
    ReviewNotifier notifier;

    ReviewReminderJob job;
    int reminderDays = 2;
    boolean enabled = true;
    boolean notify = true;

    @BeforeEach
    void setUp() {
        job = new ReviewReminderJob(orders, reviews, customers, settings, notifier, Clock.fixed(NOW, ZoneOffset.UTC));
        lenient().when(settings.get(eq(ReviewSettings.REVIEWS_ENABLED), any(Boolean.class))).thenAnswer(i -> enabled);
        lenient().when(settings.get(eq(OrderSettings.NOTIFY_CUSTOMER_STATUS), any(Boolean.class)))
                .thenAnswer(i -> notify);
        lenient().when(settings.get(eq(ReviewSettings.REVIEWS_REMINDER_DAYS), any(Integer.class)))
                .thenAnswer(i -> reminderDays);
        lenient().when(settings.get(eq(ReviewSettings.REVIEWS_BONUS_PERCENT), any(Integer.class))).thenReturn(5);
        lenient().when(settings.get(eq(ReviewSettings.REVIEWS_BONUS_MAX_UAH), any(Integer.class))).thenReturn(100);
        lenient().when(notifier.enabled()).thenReturn(true);
    }

    private static DeliveredOrder candidate(long tgUser, Duration deliveredAgo) {
        return new DeliveredOrder(new byte[16], tgUser, NOW.minus(deliveredAgo), List.of(10L, 11L));
    }

    private void scanReturns(DeliveredOrder... found) {
        when(orders.deliveredWithoutReminder(NOW.minus(Duration.ofDays(2 + ReviewRules.REMINDER_WINDOW_DAYS)),
                NOW.minus(Duration.ofDays(2)), ReviewReminderJob.BATCH, 0)).thenReturn(List.of(found));
    }

    @Test
    void scansTheWindowAfterTheDelayAndSendsOncePerOrder() {
        DeliveredOrder due = candidate(1L, Duration.ofDays(3));
        DeliveredOrder claimedElsewhere = candidate(2L, Duration.ofDays(4));
        scanReturns(due, claimedElsewhere);
        when(orders.claimReminder(due.orderId(), NOW)).thenReturn(true, false);
        when(notifier.reminder(1L, due.orderId(), 5, 10_000L)).thenReturn(true);

        assertThat(job.sendDue()).isEqualTo(1);
        verify(notifier, never()).reminder(eq(2L), any(), anyInt(), anyLong());
    }

    @Test
    void ordersWithEveryLineReviewedOrABlockedBotAreReadPast() {
        DeliveredOrder reviewed = candidate(1L, Duration.ofDays(3));
        DeliveredOrder blocked = candidate(2L, Duration.ofDays(3));
        DeliveredOrder due = candidate(3L, Duration.ofDays(3));
        scanReturns(reviewed, blocked, due);
        when(reviews.reviewedItemIds(any())).thenReturn(List.of(10L, 11L), List.of(10L), List.of(10L));
        User blockedUser = new User();
        blockedUser.setBotBlocked(true);
        when(customers.findById(2L)).thenReturn(Optional.of(blockedUser));
        when(orders.claimReminder(any(), any())).thenReturn(true);
        when(notifier.reminder(eq(3L), any(), anyInt(), anyLong())).thenReturn(true);

        assertThat(job.sendDue()).isEqualTo(1);
        verify(orders).claimReminder(due.orderId(), NOW);
        verify(notifier, never()).reminder(eq(1L), any(), anyInt(), anyLong());
        verify(notifier, never()).reminder(eq(2L), any(), anyInt(), anyLong());
    }

    @Test
    void tooEarlyCandidateIsSkipped() {
        DeliveredOrder early = candidate(1L, Duration.ofHours(10));
        when(orders.deliveredWithoutReminder(any(), any(), anyInt(), anyInt())).thenReturn(List.of(early));

        assertThat(job.sendDue()).isZero();
        verify(orders, never()).claimReminder(any(), any());
    }

    @Test
    void offSwitchesAreRespected() {
        reminderDays = 0;
        assertThat(job.sendDue()).isZero();
        reminderDays = 2;
        enabled = false;
        assertThat(job.sendDue()).isZero();
        enabled = true;
        notify = false;
        assertThat(job.sendDue()).isZero();
        verify(orders, never()).deliveredWithoutReminder(any(), any(), anyInt(), anyInt());
    }
}
