package com.maxsolch.shop.ai.app;

import com.maxsolch.shop.ai.domain.AiError;
import com.maxsolch.shop.ai.domain.AiEvents;
import com.maxsolch.shop.ai.domain.AiFeature;
import com.maxsolch.shop.ai.domain.AiJob;
import com.maxsolch.shop.ai.domain.JobMode;
import com.maxsolch.shop.ai.infra.AiLimitStore;
import com.maxsolch.shop.ai.infra.AiUsageRepository;
import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.platform.jobs.DbLocks;
import com.maxsolch.shop.platform.time.ShopZone;
import com.maxsolch.shop.platform.tx.DomainEvents;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * The money guard: the day and the month in the shop zone, spent plus the reserves of the others, "at the limit" stops,
 * 0 means no limit, a reservation is made only when it fits.
 */
class AiLimitsTest {

    private static final long USD = 1_000_000L;

    private final AiUsageRepository spent = mock(AiUsageRepository.class);
    private final AiLimitStore reserves = mock(AiLimitStore.class);
    private final AiUsageLog log = mock(AiUsageLog.class);
    private final AiPolicy policy = mock(AiPolicy.class);
    private final AiEstimate estimate = mock(AiEstimate.class);
    private final DbLocks locks = mock(DbLocks.class);
    private final DomainEvents events = mock(DomainEvents.class);

    private AiLimits at(String instant) {
        return new AiLimits(spent, reserves, log, policy, estimate, locks, events,
                Clock.fixed(Instant.parse(instant), ZoneOffset.UTC), new ShopZone("Europe/Kyiv"));
    }

    private static AiJob job() {
        AiJob job = AiJob.queued(new AiJob.Spec(AiFeature.CARD, 1, "PRODUCT", "1", null, JobMode.NORMAL, "low", 1, null,
                null, null), Instant.parse("2026-11-07T10:00:00Z"));
        ReflectionTestUtils.setField(job, "id", 5L);
        return job;
    }

    private void limits(long monthUsd, long dayUsd) {
        when(policy.monthLimitMicro()).thenReturn(monthUsd * USD);
        when(policy.dayLimitMicro()).thenReturn(dayUsd * USD);
    }

    @Test
    void theDayAndTheMonthStartAtMidnightInKyiv() {
        AiLimits limits = at("2026-11-07T10:00:00Z");

        assertThat(limits.dayStart()).isEqualTo(Instant.parse("2026-11-06T22:00:00Z"));
        assertThat(limits.monthStart()).isEqualTo(Instant.parse("2026-10-31T22:00:00Z"));
    }

    @Test
    void justAfterMidnightInKyivIsAlreadyTheNextDay() {
        // 00:30 on 1 November in Kyiv is still 31 October in UTC
        AiLimits limits = at("2026-10-31T22:30:00Z");

        assertThat(limits.dayStart()).isEqualTo(Instant.parse("2026-10-31T22:00:00Z"));
        assertThat(limits.monthStart()).isEqualTo(Instant.parse("2026-10-31T22:00:00Z"));
    }

    @Test
    void spendAtTheMonthLimitStopsTheNextTurnAndTellsTheOwner() {
        limits(10, 0);
        when(spent.spentSince(any())).thenReturn(10 * USD);

        assertThatThrownBy(() -> at("2026-11-07T10:00:00Z").ensureRoom(1)).isInstanceOfSatisfying(
                DomainException.class, e -> assertThat(e.errorCode()).isEqualTo(AiError.MONTH_LIMIT));
        verify(events).publish(any(AiEvents.LimitReached.class));
    }

    @Test
    void spendBelowTheLimitPasses() {
        limits(10, 0);
        when(spent.spentSince(any())).thenReturn(10 * USD - 1);

        assertThatCode(() -> at("2026-11-07T10:00:00Z").ensureRoom(1)).doesNotThrowAnyException();
    }

    @Test
    void theReservesOfOtherRunningJobsCountAsSpent() {
        limits(10, 0);
        when(spent.spentSince(any())).thenReturn(5 * USD);
        when(reserves.openReserves(1L)).thenReturn(5 * USD);

        assertThatThrownBy(() -> at("2026-11-07T10:00:00Z").ensureRoom(1)).isInstanceOf(DomainException.class);
    }

    @Test
    void theDayLimitStopsOnItsOwn() {
        limits(100, 1);
        when(spent.spentSince(any())).thenReturn(USD);

        assertThatThrownBy(() -> at("2026-11-07T10:00:00Z").ensureRoom(1)).isInstanceOfSatisfying(
                DomainException.class, e -> assertThat(e.errorCode()).isEqualTo(AiError.DAY_LIMIT));
    }

    @Test
    void zeroMeansNoLimitAndTheJournalIsNotRead() {
        limits(0, 0);

        assertThatCode(() -> at("2026-11-07T10:00:00Z").ensureRoom(1)).doesNotThrowAnyException();
        verify(spent, never()).spentSince(any());
    }

    @Test
    void aLostJournalRowStillCounts() {
        limits(10, 0);
        when(spent.spentSince(any())).thenReturn(9 * USD);
        when(log.lostMicroUsd()).thenReturn(USD);

        assertThatThrownBy(() -> at("2026-11-07T10:00:00Z").ensureRoom(1)).isInstanceOf(DomainException.class);
    }

    @Test
    void preflightRefusesWhenTheExpectedCostDoesNotFitAndSaysNothingToTheOwner() {
        limits(10, 0);
        when(spent.spentSince(any())).thenReturn(9 * USD);
        when(estimate.of(AiFeature.CARD, JobMode.NORMAL, 1))
                .thenReturn(new AiEstimate.Estimate(1, 2 * USD, 60, false));

        assertThatThrownBy(() -> at("2026-11-07T10:00:00Z").preflight(AiFeature.CARD, JobMode.NORMAL, 1))
                .isInstanceOf(DomainException.class);
        verify(events, never()).publish(any());
    }

    @Test
    void aJobThatFitsTakesItsReserveUnderTheLock() {
        limits(10, 0);
        when(spent.spentSince(any())).thenReturn(2 * USD);
        AiJob job = job();
        when(estimate.of(any(), any(), org.mockito.ArgumentMatchers.anyInt()))
                .thenReturn(new AiEstimate.Estimate(1, 3 * USD, 60, false));
        when(locks.lockWaiting(eq("ai-limits"), any(Duration.class), any(Duration.class)))
                .thenReturn(Optional.of(mock(DbLocks.Held.class)));

        at("2026-11-07T10:00:00Z").reserve(job);

        ArgumentCaptor<Long> amount = ArgumentCaptor.forClass(Long.class);
        verify(reserves).put(anyLong(), amount.capture());
        assertThat(amount.getValue()).isEqualTo(3 * USD);
    }

    @Test
    void aJobThatDoesNotFitTakesNoReserve() {
        limits(10, 0);
        when(spent.spentSince(any())).thenReturn(5 * USD);
        when(reserves.openReserves(any())).thenReturn(3 * USD);
        AiJob job = job();
        when(estimate.of(any(), any(), org.mockito.ArgumentMatchers.anyInt()))
                .thenReturn(new AiEstimate.Estimate(1, 3 * USD, 60, false));
        when(locks.lockWaiting(eq("ai-limits"), any(Duration.class), any(Duration.class)))
                .thenReturn(Optional.of(mock(DbLocks.Held.class)));

        assertThatThrownBy(() -> at("2026-11-07T10:00:00Z").reserve(job)).isInstanceOf(DomainException.class);
        verify(reserves, never()).put(anyLong(), anyLong());
    }
}
