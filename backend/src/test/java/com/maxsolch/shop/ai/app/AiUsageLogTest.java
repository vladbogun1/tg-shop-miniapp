package com.maxsolch.shop.ai.app;

import com.maxsolch.shop.ai.domain.AiError;
import com.maxsolch.shop.ai.domain.AiFeature;
import com.maxsolch.shop.ai.domain.TokenUsage;
import com.maxsolch.shop.ai.infra.AiProperties;
import com.maxsolch.shop.ai.infra.AiUsageRepository;
import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.platform.time.ShopZone;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** The monthly limit: checked before every model call, the month starts in the shop zone, 0 = no limit. */
class AiUsageLogTest {

    private final AiUsageRepository repo = mock(AiUsageRepository.class);
    private final AiProperties props = new AiProperties();
    /** 1 November 00:30 in Kyiv is still 31 October in UTC. */
    private final Clock clock = Clock.fixed(Instant.parse("2026-10-31T22:30:00Z"), ZoneOffset.UTC);
    private final AiUsageLog log = new AiUsageLog(repo, props, clock, new ShopZone("Europe/Kyiv"));

    @Test
    void spendAtTheLimitStopsTheNextCall() {
        props.setMonthLimitCents(1000);
        when(repo.spentSince(any())).thenReturn(10_000_000L);

        assertThatThrownBy(log::ensureWithinLimit).isInstanceOfSatisfying(DomainException.class,
                e -> assertThat(e.errorCode()).isEqualTo(AiError.MONTH_LIMIT));
    }

    @Test
    void spendBelowTheLimitPasses() {
        props.setMonthLimitCents(1000);
        when(repo.spentSince(any())).thenReturn(9_999_999L);

        assertThatCode(log::ensureWithinLimit).doesNotThrowAnyException();
    }

    @Test
    void zeroMeansNoLimitAndTheJournalIsNotEvenRead() {
        props.setMonthLimitCents(0);

        assertThatCode(log::ensureWithinLimit).doesNotThrowAnyException();
        verify(repo, never()).spentSince(any());
    }

    @Test
    void theMonthStartsAtMidnightInKyiv() {
        props.setMonthLimitCents(1000);
        when(repo.spentSince(any())).thenReturn(0L);

        log.ensureWithinLimit();

        verify(repo).spentSince(Instant.parse("2026-10-31T22:00:00Z"));
    }

    @Test
    void aLostJournalRowStillCountsTowardsTheLimit() {
        props.setMonthLimitCents(1000);
        when(repo.save(any())).thenThrow(new IllegalStateException("db down"));
        when(repo.spentSince(any())).thenReturn(9_000_000L);

        long cost = log.model(AiFeature.CARD, new TokenUsage(0, 0, 2_000_000), 10, null);

        assertThat(cost).isPositive();
        assertThat(log.month().lostRows()).isEqualTo(1);
        assertThatThrownBy(log::ensureWithinLimit).isInstanceOf(DomainException.class);
    }
}
