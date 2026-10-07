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
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/** "Your bonus runs out soon": which codes, once each, and only when switched on. */
@ExtendWith(MockitoExtension.class)
class BonusExpiryReminderJobTest {

    private static final Instant NOW = Instant.parse("2026-10-07T12:00:00Z");

    @Mock
    ReviewStore store;
    @Mock
    SettingsService settings;
    @Mock
    ReviewNotifier notifier;

    BonusExpiryReminderJob job;
    int days = 3;
    boolean enabled = true;
    boolean notify = true;

    @BeforeEach
    void setUp() {
        job = new BonusExpiryReminderJob(store, settings, notifier);
        job.setClock(Clock.fixed(NOW, ZoneOffset.UTC));
        lenient().when(settings.get(eq(SettingsRegistry.REVIEWS_ENABLED), any(Boolean.class))).thenAnswer(i -> enabled);
        lenient().when(settings.get(eq(SettingsRegistry.NOTIFY_CUSTOMER_STATUS), any(Boolean.class)))
                .thenAnswer(i -> notify);
        lenient().when(settings.get(eq(SettingsRegistry.REVIEWS_BONUS_EXPIRY_REMINDER_DAYS), any(Integer.class)))
                .thenAnswer(i -> days);
        lenient().when(notifier.enabled()).thenReturn(true);
    }

    private static ReviewStore.BonusExpiryCandidate code(long tgUser, String code) {
        return new ReviewStore.BonusExpiryCandidate(new byte[16], tgUser, code, 5, NOW.plus(Duration.ofDays(2)));
    }

    @Test
    void looksAheadTheWindowSkipsFreshCodesAndSendsOncePerCode() {
        ReviewStore.BonusExpiryCandidate due = code(1L, "THANKS-AAAAAA");
        ReviewStore.BonusExpiryCandidate claimedElsewhere = code(2L, "THANKS-BBBBBB");
        when(store.bonusExpiryCandidates(NOW, NOW.plus(Duration.ofDays(3)), NOW.minus(Duration.ofDays(3)),
                BonusExpiryReminderJob.BATCH)).thenReturn(List.of(due, claimedElsewhere));
        when(store.claimBonusExpiryReminder(due.promoId(), NOW)).thenReturn(true, false);
        when(notifier.bonusExpiring(1L, "THANKS-AAAAAA", 5, due.expiresAt())).thenReturn(true);

        assertThat(job.sendDue()).isEqualTo(1);
        verify(notifier, never()).bonusExpiring(eq(2L), anyString(), anyInt(), any());
    }

    @Test
    void failedDmIsNotCounted() {
        ReviewStore.BonusExpiryCandidate due = code(1L, "THANKS-AAAAAA");
        when(store.bonusExpiryCandidates(any(), any(), any(), anyInt())).thenReturn(List.of(due));
        when(store.claimBonusExpiryReminder(any(), any())).thenReturn(true);
        when(notifier.bonusExpiring(any(), any(), anyInt(), any())).thenReturn(false);

        assertThat(job.sendDue()).isZero();
    }

    @Test
    void zeroDaysTurnsItOff() {
        days = 0;
        assertThat(job.sendDue()).isZero();
        verifyNoInteractions(store);
    }

    @Test
    void reviewsOffOrCustomerDmsOffSendNothing() {
        enabled = false;
        assertThat(job.sendDue()).isZero();
        enabled = true;
        notify = false;
        assertThat(job.sendDue()).isZero();
        verifyNoInteractions(store);
    }
}
