package com.maxsolch.shop.ai.app;

import com.maxsolch.shop.ai.domain.AiError;
import com.maxsolch.shop.ai.domain.AiFeature;
import com.maxsolch.shop.ai.domain.AiJob;
import com.maxsolch.shop.ai.domain.JobMode;
import com.maxsolch.shop.ai.domain.JobStatus;
import com.maxsolch.shop.ai.domain.JobTotals;
import com.maxsolch.shop.ai.infra.AiJobRepository;
import com.maxsolch.shop.audit.app.AdminAuditService;
import com.maxsolch.shop.platform.error.DomainException;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** The outcome is reported once: a repeated call (double click, retried request) changes and audits nothing. */
class AiOutcomeTest {

    private static final Instant T0 = Instant.parse("2026-11-07T10:00:00Z");

    private final AiJobRepository jobs = mock(AiJobRepository.class);
    private final AdminAuditService audit = mock(AdminAuditService.class);
    private final AiOutcome outcome = new AiOutcome(jobs, audit, Clock.fixed(T0, ZoneOffset.UTC));

    private AiJob doneJob() {
        AiJob j = AiJob.queued(new AiJob.Spec(AiFeature.CARD, 1, "PRODUCT", "42", null, JobMode.NORMAL, "low", 1, null,
                null, null), T0);
        j.claim("w", T0, Duration.ofMinutes(5));
        j.finish(JobStatus.DONE, JobTotals.NONE, T0);
        when(jobs.findById(9L)).thenReturn(Optional.of(j));
        return j;
    }

    @Test
    void theSecondReportDoesNotChangeOrAuditAnything() {
        AiJob j = doneJob();

        outcome.record(9L, new AiJob.Outcome(4, 1, 0, 0));
        outcome.record(9L, new AiJob.Outcome(0, 9, 9, 9));

        assertThat(j.getOutcome()).isEqualTo("PARTIAL");
        assertThat(j.getOutcomeApplied()).isEqualTo(4);
        assertThat(j.getOutcomeRejected()).isEqualTo(1);
        verify(audit, times(1)).record(eq("AI_JOB_OUTCOME"), anyString(), anyString(), anyString());
    }

    @Test
    void anUnknownJobIsNotFound() {
        when(jobs.findById(1L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> outcome.record(1L, new AiJob.Outcome(1, 0, 0, 0)))
                .isInstanceOfSatisfying(DomainException.class,
                        e -> assertThat(e.errorCode()).isEqualTo(AiError.JOB_NOT_FOUND));
    }

    @Test
    void negativeCountsAreRefused() {
        doneJob();

        assertThatThrownBy(() -> outcome.record(9L, new AiJob.Outcome(-1, 0, 0, 0)))
                .isInstanceOf(DomainException.BadRequest.class);
    }
}
