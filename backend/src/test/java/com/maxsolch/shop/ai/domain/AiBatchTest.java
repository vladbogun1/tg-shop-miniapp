package com.maxsolch.shop.ai.domain;

import org.junit.jupiter.api.Test;

import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;

/** The life of a batch: the first pause reason stays, nothing moves a finished batch, a big batch runs two at a time. */
class AiBatchTest {

    private static final Instant T0 = Instant.parse("2026-11-07T10:00:00Z");
    private static final Instant T1 = T0.plusSeconds(60);

    private static AiBatch batch(int total) {
        return AiBatch.started(AiFeature.COMPLETION, 7, total, "k", null, T0);
    }

    @Test
    void aBigBatchRunsTwoJobsAtOnceASmallOneThree() {
        assertThat(batch(30).getParallel()).isEqualTo(AiBatch.PARALLEL_BIG);
        assertThat(batch(20).getParallel()).isEqualTo(AiBatch.PARALLEL_BIG);
        assertThat(batch(19).getParallel()).isEqualTo(AiBatch.PARALLEL_SMALL);
    }

    @Test
    void theFirstPauseReasonStays() {
        AiBatch b = batch(5);

        assertThat(b.pause(PauseReason.LIMIT_DAY, T1)).isTrue();
        assertThat(b.pause(PauseReason.RESTART, T1)).isFalse();

        assertThat(b.getStatus()).isEqualTo(BatchStatus.PAUSED);
        assertThat(b.getPauseReason()).isEqualTo(PauseReason.LIMIT_DAY);
    }

    @Test
    void resumeOnlyFromPauseAndItClearsTheReason() {
        AiBatch b = batch(5);
        assertThat(b.resume(T1)).isFalse();

        b.pause(PauseReason.MANUAL, T1);
        assertThat(b.resume(T1)).isTrue();

        assertThat(b.getStatus()).isEqualTo(BatchStatus.RUNNING);
        assertThat(b.getPauseReason()).isNull();
    }

    @Test
    void completeMovesOnceEvenFromPause() {
        AiBatch b = batch(5);
        b.pause(PauseReason.MANUAL, T1);

        assertThat(b.complete(T1)).isTrue();
        assertThat(b.complete(T1)).isFalse();

        assertThat(b.getStatus()).isEqualTo(BatchStatus.DONE);
        assertThat(b.getFinishedAt()).isEqualTo(T1);
    }

    @Test
    void aFinishedBatchCannotBePausedResumedOrCanceled() {
        AiBatch b = batch(5);
        b.cancel(T1);

        assertThat(b.pause(PauseReason.MANUAL, T1)).isFalse();
        assertThat(b.resume(T1)).isFalse();
        assertThat(b.cancel(T1)).isFalse();
        assertThat(b.complete(T1)).isFalse();
        assertThat(b.getStatus()).isEqualTo(BatchStatus.CANCELED);
    }
}
