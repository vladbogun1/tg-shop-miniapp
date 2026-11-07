package com.maxsolch.shop.ai.domain;

import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** The life of a job: only the allowed moves, the first outcome stays, a stop of a queued job is immediate. */
class AiJobTest {

    private static final Instant T0 = Instant.parse("2026-11-07T10:00:00Z");

    private static AiJob queued() {
        return AiJob.queued(new AiJob.Spec(AiFeature.CARD, 7, "PRODUCT", "42", "v1", JobMode.NORMAL, "medium", 1,
                "card-1", null, null), T0);
    }

    private static AiJob running() {
        AiJob j = queued();
        j.claim("w1", T0, Duration.ofMinutes(5));
        return j;
    }

    @Test
    void transitionTableAllowsOnlyTheDocumentedMoves() {
        assertThat(JobStatus.QUEUED.next()).containsExactlyInAnyOrder(JobStatus.RUNNING, JobStatus.CANCELED,
                JobStatus.FAILED);
        assertThat(JobStatus.RUNNING.next()).containsExactlyInAnyOrder(JobStatus.DONE, JobStatus.EMPTY,
                JobStatus.BAD_ANSWER, JobStatus.FAILED, JobStatus.CANCELED, JobStatus.QUEUED);
        for (JobStatus end : new JobStatus[]{JobStatus.DONE, JobStatus.EMPTY, JobStatus.BAD_ANSWER, JobStatus.FAILED,
                JobStatus.CANCELED}) {
            assertThat(end.next()).isEmpty();
            assertThat(end.finished()).isTrue();
        }
        assertThat(JobStatus.QUEUED.active()).isTrue();
        assertThat(JobStatus.RUNNING.active()).isTrue();
    }

    @Test
    void claimCountsTheAttemptAndSetsADeadline() {
        AiJob j = running();

        assertThat(j.getStatus()).isEqualTo(JobStatus.RUNNING);
        assertThat(j.getAttempts()).isEqualTo(1);
        assertThat(j.getDeadlineAt()).isEqualTo(T0.plus(Duration.ofMinutes(5)));
        assertThat(j.getLockedBy()).isEqualTo("w1");
    }

    @Test
    void aFinishedJobDoesNotMoveAgain() {
        AiJob j = running();
        j.finish(JobStatus.DONE, JobTotals.NONE, T0);

        assertThatThrownBy(() -> j.claim("w2", T0, Duration.ofMinutes(5))).isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(j::requeue).isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> j.fail("X", null, JobTotals.NONE, T0)).isInstanceOf(IllegalStateException.class);
    }

    @Test
    void finishTakesOnlyAVerdict() {
        AiJob j = running();

        assertThatThrownBy(() -> j.finish(JobStatus.FAILED, JobTotals.NONE, T0))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void stoppingAQueuedJobEndsItAtOnceAndARunningOneOnlyRaisesTheFlag() {
        AiJob waiting = queued();
        assertThat(waiting.requestCancel(T0)).isTrue();
        assertThat(waiting.getStatus()).isEqualTo(JobStatus.CANCELED);

        AiJob busy = running();
        assertThat(busy.requestCancel(T0)).isFalse();
        assertThat(busy.getStatus()).isEqualTo(JobStatus.RUNNING);
        assertThat(busy.isCancelRequested()).isTrue();
    }

    @Test
    void requeueGivesTheJobBackWithoutForgettingTheAttempt() {
        AiJob j = running();
        j.requeue();

        assertThat(j.getStatus()).isEqualTo(JobStatus.QUEUED);
        assertThat(j.getLockedBy()).isNull();
        assertThat(j.getAttempts()).isEqualTo(1);
    }

    @Test
    void theFirstOutcomeStaysAndOnlyAResultHasOne() {
        AiJob j = running();
        assertThat(j.recordOutcome(new AiJob.Outcome(3, 0, 0, 0), T0)).isFalse();

        j.finish(JobStatus.DONE, JobTotals.NONE, T0);
        assertThat(j.recordOutcome(new AiJob.Outcome(3, 1, 1, 0), T0)).isTrue();
        assertThat(j.recordOutcome(new AiJob.Outcome(0, 9, 0, 0), T0)).isFalse();

        assertThat(j.getOutcome()).isEqualTo("PARTIAL");
        assertThat(j.getOutcomeApplied()).isEqualTo(3);
    }

    @Test
    void outcomeVerdictFollowsTheCounts() {
        assertThat(new AiJob.Outcome(5, 0, 2, 0).verdict()).isEqualTo("APPLIED");
        assertThat(new AiJob.Outcome(0, 5, 0, 0).verdict()).isEqualTo("REJECTED");
        assertThat(new AiJob.Outcome(2, 0, 0, 1).verdict()).isEqualTo("PARTIAL");
    }

    @Test
    void staleMeansRunningAndSilent() {
        AiJob j = running();

        assertThat(j.stale(T0.plusSeconds(30), Duration.ofSeconds(60))).isFalse();
        assertThat(j.stale(T0.plusSeconds(61), Duration.ofSeconds(60))).isTrue();
        assertThat(queued().stale(T0.plusSeconds(999), Duration.ofSeconds(60))).isFalse();
    }
}
