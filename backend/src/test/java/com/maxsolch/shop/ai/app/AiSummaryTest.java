package com.maxsolch.shop.ai.app;

import com.maxsolch.shop.ai.domain.AiError;
import com.maxsolch.shop.ai.domain.AiFeature;
import com.maxsolch.shop.ai.domain.JobStatus;
import com.maxsolch.shop.ai.infra.AiJobRepository;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/** What the chip and the entry buttons read: switches, a used-up limit, the three counts; no money anywhere. */
class AiSummaryTest {

    private final AiPolicy policy = mock(AiPolicy.class);
    private final AiLimits limits = mock(AiLimits.class);
    private final AiAgent agent = mock(AiAgent.class);
    private final AiJobRepository jobs = mock(AiJobRepository.class);
    private final AiSummary summary = new AiSummary(policy, limits, agent, jobs,
            Clock.fixed(Instant.parse("2026-11-07T10:00:00Z"), ZoneOffset.UTC));

    @Test
    void reportsSwitchesCountsAndAUsedUpLimit() {
        when(agent.configured()).thenReturn(true);
        when(policy.enabled()).thenReturn(true);
        when(policy.featureOn(any())).thenAnswer(i -> i.getArgument(0) == AiFeature.CARD);
        when(limits.exhausted()).thenReturn(Optional.of(AiError.DAY_LIMIT));
        when(jobs.countByStatus(JobStatus.QUEUED)).thenReturn(1L);
        when(jobs.countByStatus(JobStatus.RUNNING)).thenReturn(2L);
        when(jobs.countByStatusAndOutcomeIsNullAndFinishedAtAfter(any(), any())).thenReturn(4L);
        when(jobs.countUnretried(any(), any())).thenReturn(5L);

        AiSummary.Summary s = summary.summary();

        assertThat(s.configured()).isTrue();
        assertThat(s.featuresOn()).containsExactly(AiFeature.CARD);
        assertThat(s.limit()).isEqualTo("DAY");
        assertThat(s.running()).isEqualTo(3);
        assertThat(s.review()).isEqualTo(4);
        assertThat(s.problems()).isEqualTo(5);
    }

    @Test
    void noLimitMeansNull() {
        when(limits.exhausted()).thenReturn(Optional.empty());
        assertThat(summary.summary().limit()).isNull();
    }
}
