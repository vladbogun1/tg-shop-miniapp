package com.maxsolch.shop.review;

import com.maxsolch.shop.settings.SettingsRegistry;
import com.maxsolch.shop.settings.SettingsService;
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

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
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
    ReviewStore store;
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
        job = new ReviewReminderJob(store, settings, notifier);
        job.setClock(Clock.fixed(NOW, ZoneOffset.UTC));
        lenient().when(settings.get(eq(SettingsRegistry.REVIEWS_ENABLED), any(Boolean.class))).thenAnswer(i -> enabled);
        lenient().when(settings.get(eq(SettingsRegistry.NOTIFY_CUSTOMER_STATUS), any(Boolean.class)))
                .thenAnswer(i -> notify);
        lenient().when(settings.get(eq(SettingsRegistry.REVIEWS_REMINDER_DAYS), any(Integer.class)))
                .thenAnswer(i -> reminderDays);
        lenient().when(settings.get(eq(SettingsRegistry.REVIEWS_BONUS_PERCENT), any(Integer.class))).thenReturn(5);
        lenient().when(notifier.enabled()).thenReturn(true);
    }

    private static ReviewStore.ReminderCandidate candidate(long tgUser, Duration deliveredAgo) {
        return new ReviewStore.ReminderCandidate(new byte[16], tgUser, NOW.minus(deliveredAgo), true);
    }

    @Test
    void scansTheWindowAfterTheDelayAndSendsOncePerOrder() {
        ReviewStore.ReminderCandidate due = candidate(1L, Duration.ofDays(3));
        ReviewStore.ReminderCandidate claimedElsewhere = candidate(2L, Duration.ofDays(4));
        when(store.reminderCandidates(NOW.minus(Duration.ofDays(2 + ReviewRules.REMINDER_WINDOW_DAYS)),
                NOW.minus(Duration.ofDays(2)), ReviewReminderJob.BATCH))
                .thenReturn(List.of(due, claimedElsewhere));
        when(store.claimReminder(due.orderId(), NOW)).thenReturn(true, false);
        when(notifier.reminder(1L, due.orderId(), 5)).thenReturn(true);

        assertThat(job.sendDue()).isEqualTo(1);
        verify(notifier, never()).reminder(eq(2L), any(), anyInt());
    }

    @Test
    void tooEarlyCandidateIsSkipped() {
        ReviewStore.ReminderCandidate early = candidate(1L, Duration.ofHours(10));
        when(store.reminderCandidates(any(), any(), anyInt())).thenReturn(List.of(early));

        assertThat(job.sendDue()).isZero();
        verify(store, never()).claimReminder(any(), any());
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
        verify(store, never()).reminderCandidates(any(), any(), anyInt());
    }
}
