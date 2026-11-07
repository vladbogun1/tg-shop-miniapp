package com.maxsolch.shop.ai.app;

import com.maxsolch.shop.ai.domain.AiFeature;
import com.maxsolch.shop.ai.domain.JobMode;
import com.maxsolch.shop.ai.infra.AiUsageQueries;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.stream.LongStream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/** The estimate before the start: constants until there is history, then the p50 / p90 of our own jobs. */
class AiEstimateTest {

    private final AiUsageQueries usage = mock(AiUsageQueries.class);
    private final AiEstimate estimate = new AiEstimate(usage,
            Clock.fixed(Instant.parse("2026-11-07T10:00:00Z"), ZoneOffset.UTC));

    @Test
    void withoutHistoryTheBenchmarkConstantsAnswer() {
        when(usage.recentCosts(any(), any(), anyInt())).thenReturn(List.of(1L, 2L));

        AiEstimate.Estimate e = estimate.of(AiFeature.CARD, JobMode.NORMAL, 1);

        assertThat(e.fromHistory()).isFalse();
        assertThat(e.p50MicroUsd()).isEqualTo(4_800);
        assertThat(e.p90MicroUsd()).isEqualTo(9_000);
    }

    @Test
    void withTenJobsTheHistoryAnswers() {
        List<Long> costs = LongStream.rangeClosed(1, 10).map(i -> i * 1000).boxed().toList();
        when(usage.recentCosts(any(), any(), anyInt())).thenReturn(costs);

        AiEstimate.Estimate e = estimate.of(AiFeature.CARD, JobMode.NORMAL, 1);

        assertThat(e.fromHistory()).isTrue();
        assertThat(e.p50MicroUsd()).isEqualTo(5_000);
        assertThat(e.p90MicroUsd()).isEqualTo(9_000);
    }

    @Test
    void thoroughCostsTwiceAndSeveralSubjectsCostPerSubject() {
        when(usage.recentCosts(any(), any(), anyInt())).thenReturn(List.of());

        AiEstimate.Estimate e = estimate.of(AiFeature.TRANSLATION, JobMode.THOROUGH, 3);

        assertThat(e.p90MicroUsd()).isEqualTo(6_000L * 2 * 3);
    }

    @Test
    void percentileIsNearestRank() {
        assertThat(AiEstimate.percentile(List.of(1L, 2L, 3L, 4L), 50)).isEqualTo(2);
        assertThat(AiEstimate.percentile(List.of(1L, 2L, 3L, 4L), 90)).isEqualTo(4);
        assertThat(AiEstimate.percentile(List.of(7L), 90)).isEqualTo(7);
    }
}
