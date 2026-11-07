package com.maxsolch.shop.ai.app;

import com.maxsolch.shop.ai.domain.AiBatch;
import com.maxsolch.shop.ai.domain.AiEvents;
import com.maxsolch.shop.ai.domain.AiFeature;
import com.maxsolch.shop.ai.domain.AiJob;
import com.maxsolch.shop.ai.domain.BatchStatus;
import com.maxsolch.shop.ai.domain.JobMode;
import com.maxsolch.shop.ai.domain.JobStatus;
import com.maxsolch.shop.ai.domain.JobTotals;
import com.maxsolch.shop.ai.domain.PauseReason;
import com.maxsolch.shop.ai.infra.AiBatchQueries;
import com.maxsolch.shop.ai.infra.AiBatchRepository;
import com.maxsolch.shop.ai.infra.AiJobRepository;
import com.maxsolch.shop.platform.tx.DomainEvents;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** The rules of a running batch: the last job finishes it once, three failures or a blind search stop it, a limit pauses it. */
class AiBatchRunnerTest {

    private static final Instant T0 = Instant.parse("2026-11-07T10:00:00Z");

    private final AiBatchRepository batches = mock(AiBatchRepository.class);
    private final AiJobRepository jobs = mock(AiJobRepository.class);
    private final AiBatchQueries queries = mock(AiBatchQueries.class);
    private final DomainEvents events = mock(DomainEvents.class);
    private final AiBatchRunner runner = new AiBatchRunner(batches, jobs, queries, events,
            Clock.fixed(T0, ZoneOffset.UTC));
    private final AiBatch batch = AiBatch.started(AiFeature.COMPLETION, 7, 5, null, null, T0);

    AiBatchRunnerTest() {
        when(batches.lockById(0L)).thenReturn(Optional.of(batch));
        when(queries.done(0L)).thenReturn(3);
    }

    private static AiJob ended(JobStatus status) {
        AiJob j = AiJob.queued(new AiJob.Spec(AiFeature.COMPLETION, 7, "PRODUCT", "p" + status.ordinal(), "v", JobMode.NORMAL,
                "medium", 1, "v", null, null), T0);
        j.claim("w", T0, Duration.ofMinutes(5));
        if (status == JobStatus.FAILED) {
            j.fail("AI_FAILED", null, JobTotals.NONE, T0);
        } else {
            j.finish(status, JobTotals.NONE, T0);
        }
        return j;
    }

    @Test
    void theLastJobFinishesTheBatchAndSendsOneEvent() {
        when(queries.active(0L)).thenReturn(0);

        runner.jobEnded(0L);
        runner.jobEnded(0L);

        assertThat(batch.getStatus()).isEqualTo(BatchStatus.DONE);
        verify(events, times(1)).publish(any(AiEvents.BatchFinished.class));
    }

    @Test
    void aBatchWithJobsLeftKeepsRunning() {
        when(queries.active(0L)).thenReturn(2);
        when(jobs.findTop3ByBatchIdAndFinishedAtIsNotNullOrderByFinishedAtDescIdDesc(0L))
                .thenReturn(List.of(ended(JobStatus.DONE), ended(JobStatus.FAILED), ended(JobStatus.FAILED)));

        runner.jobEnded(0L);

        assertThat(batch.getStatus()).isEqualTo(BatchStatus.RUNNING);
        verify(events, never()).publish(any());
    }

    @Test
    void threeFailuresInARowStopTheBatchWithoutAutoContinue() {
        when(queries.active(0L)).thenReturn(2);
        when(jobs.findTop3ByBatchIdAndFinishedAtIsNotNullOrderByFinishedAtDescIdDesc(0L))
                .thenReturn(List.of(ended(JobStatus.FAILED), ended(JobStatus.FAILED), ended(JobStatus.FAILED)));

        runner.jobEnded(0L);

        assertThat(batch.getStatus()).isEqualTo(BatchStatus.PAUSED);
        assertThat(batch.getPauseReason()).isEqualTo(PauseReason.FAILURES);
        verify(events).publish(any(AiEvents.BatchProblem.class));
    }

    @Test
    void aSearchThatFindsNothingStopsTheBatch() {
        when(queries.active(0L)).thenReturn(2);
        when(queries.searchBlind(0L, AiBatchRunner.BLIND_JOBS, AiBatchRunner.BLIND_MIN_SEARCHES)).thenReturn(true);

        runner.jobEnded(0L);

        assertThat(batch.getPauseReason()).isEqualTo(PauseReason.SEARCH_DOWN);
    }

    @Test
    void aLimitPausesOnceWhateverTheNumberOfJobsThatHitIt() {
        runner.limitHit(0L, false);
        runner.limitHit(0L, true);

        assertThat(batch.getStatus()).isEqualTo(BatchStatus.PAUSED);
        assertThat(batch.getPauseReason()).isEqualTo(PauseReason.LIMIT_DAY);
        verify(events, times(1)).publish(any(AiEvents.BatchStopped.class));
    }

    @Test
    void aPausedBatchIsNotStoppedAgainByAFailure() {
        batch.pause(PauseReason.MANUAL, T0);
        when(queries.active(0L)).thenReturn(2);

        runner.jobEnded(0L);

        assertThat(batch.getPauseReason()).isEqualTo(PauseReason.MANUAL);
        verify(events, never()).publish(any());
    }
}
