package com.maxsolch.shop.review.app;

import com.maxsolch.shop.customer.app.Customers;
import com.maxsolch.shop.customer.domain.User;
import com.maxsolch.shop.order.app.OrderSettings;
import com.maxsolch.shop.promo.app.PromoExpiry;
import com.maxsolch.shop.promo.domain.ExpiringPromo;
import com.maxsolch.shop.promo.domain.PromoCode;
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
import java.util.function.Predicate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
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
    PromoExpiry promos;
    @Mock
    Customers customers;
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
        job = new BonusExpiryReminderJob(promos, customers, settings, notifier, Clock.fixed(NOW, ZoneOffset.UTC));
        lenient().when(settings.get(eq(ReviewSettings.REVIEWS_ENABLED), any(Boolean.class))).thenAnswer(i -> enabled);
        lenient().when(settings.get(eq(OrderSettings.NOTIFY_CUSTOMER_STATUS), any(Boolean.class)))
                .thenAnswer(i -> notify);
        lenient().when(settings.get(eq(ReviewSettings.REVIEWS_BONUS_EXPIRY_REMINDER_DAYS), any(Integer.class)))
                .thenAnswer(i -> days);
        lenient().when(notifier.enabled()).thenReturn(true);
    }

    private static ExpiringPromo code(long tgUser, String code) {
        return new ExpiringPromo(new byte[16], code, 5, 0, 10_000, tgUser, null, NOW.plus(Duration.ofDays(2)));
    }

    /** The owner module's scan: applies the job's own "reachable" filter to the codes it would return. */
    private void scanReturns(ExpiringPromo... found) {
        when(promos.expiring(eq(PromoCode.SOURCE_REVIEW_BONUS), eq(NOW), eq(NOW.plus(Duration.ofDays(3))),
                eq(NOW.minus(Duration.ofDays(3))), eq(BonusExpiryReminderJob.BATCH), any()))
                .thenAnswer(i -> List.of(found).stream().filter(i.<Predicate<ExpiringPromo>>getArgument(5)).toList());
    }

    @Test
    void looksAheadTheWindowSkipsFreshCodesAndSendsOncePerCode() {
        ExpiringPromo due = code(1L, "THANKS-AAAAAA");
        ExpiringPromo claimedElsewhere = code(2L, "THANKS-BBBBBB");
        scanReturns(due, claimedElsewhere);
        when(promos.claimReminder(due.promoId(), NOW)).thenReturn(true, false);
        when(notifier.bonusExpiring(1L, "THANKS-AAAAAA", 5, 10_000L, due.expiresAt())).thenReturn(true);

        assertThat(job.sendDue()).isEqualTo(1);
        verify(notifier, never()).bonusExpiring(eq(2L), anyString(), anyInt(), anyLong(), any());
    }

    @Test
    void ownersWhoBlockedTheBotAreNotReminded() {
        ExpiringPromo blocked = code(7L, "THANKS-CCCCCC");
        User blockedUser = new User();
        blockedUser.setBotBlocked(true);
        when(customers.findById(7L)).thenReturn(Optional.of(blockedUser));
        scanReturns(blocked);

        assertThat(job.sendDue()).isZero();
        verify(promos, never()).claimReminder(any(), any());
    }

    @Test
    void failedDmIsNotCounted() {
        ExpiringPromo due = code(1L, "THANKS-AAAAAA");
        scanReturns(due);
        when(promos.claimReminder(any(), any())).thenReturn(true);
        when(notifier.bonusExpiring(any(), any(), anyInt(), anyLong(), any())).thenReturn(false);

        assertThat(job.sendDue()).isZero();
    }

    @Test
    void zeroDaysTurnsItOff() {
        days = 0;
        assertThat(job.sendDue()).isZero();
        verifyNoInteractions(promos);
    }

    @Test
    void reviewsOffOrCustomerDmsOffSendNothing() {
        enabled = false;
        assertThat(job.sendDue()).isZero();
        enabled = true;
        notify = false;
        assertThat(job.sendDue()).isZero();
        verifyNoInteractions(promos);
    }
}
