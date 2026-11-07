package com.maxsolch.shop.ai.app;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.maxsolch.shop.ai.domain.AiBatch;
import com.maxsolch.shop.ai.domain.AiFeature;
import com.maxsolch.shop.ai.domain.BatchStatus;
import com.maxsolch.shop.ai.domain.JobPath;
import com.maxsolch.shop.ai.domain.JobStatus;
import com.maxsolch.shop.ai.domain.PauseReason;

import java.time.Instant;
import java.util.List;

import static com.fasterxml.jackson.annotation.JsonInclude.Include.NON_NULL;

/**
 * A batch as the screens get it: the state, the counts of its jobs (done, empty, failed...), and a short row per job.
 * The money is only for an admin with the finance right (absent for the others). {@code path} MANUAL: the manual batch
 * through ChatGPT (its jobs are the pasted answers, «Принять безопасное» takes them without the web-search condition).
 *
 * @param ready      jobs with a result nobody has decided on yet (the quick review feed)
 * @param retryable  ended without a usable result and not asked again: «Повторить неудачные (N)»
 * @param undoable   applications of «Принять безопасное» that can still be undone
 * @param undoUntil  until when the earliest of them can be undone
 */
public record AiBatchDto(
        long id, AiFeature feature, JobPath path, BatchStatus status, long adminId, int total, PauseReason pauseReason, Long retryOf,
        int queued, int running, int done, int empty, int badAnswer, int failed, int canceled, int ready, int retryable,
        int undoable, @JsonInclude(NON_NULL) Instant undoUntil, Instant createdAt, Instant finishedAt,
        @JsonInclude(NON_NULL) Long spentMinor, List<Row> jobs) {

    /** One job of the batch. {@code searched}: the job searched the web (a condition of the safe acceptance);
     * {@code applied/rejected/ignored}: the counts of its outcome (0 until there is one), the translations summary sums them. */
    public record Row(long id, String subjectId, JobStatus status, String outcome, String errorCode, boolean searched,
                     int applied, int rejected, int ignored) {
    }

    /** The counts by status; a status without jobs is zero. */
    record Counts(int queued, int running, int done, int empty, int badAnswer, int failed, int canceled) {

        static Counts of(List<Row> rows) {
            int[] n = new int[JobStatus.values().length];
            rows.forEach(r -> n[r.status().ordinal()]++);
            return new Counts(n[JobStatus.QUEUED.ordinal()], n[JobStatus.RUNNING.ordinal()], n[JobStatus.DONE.ordinal()],
                    n[JobStatus.EMPTY.ordinal()], n[JobStatus.BAD_ANSWER.ordinal()], n[JobStatus.FAILED.ordinal()],
                    n[JobStatus.CANCELED.ordinal()]);
        }
    }

    /** What the screens need beyond the batch row and its jobs. */
    record Extras(int retryable, int undoable, Instant undoUntil, Long spentMinor) {
    }

    static AiBatchDto of(AiBatch b, List<Row> rows, Extras x) {
        Counts c = Counts.of(rows);
        int ready = (int) rows.stream().filter(r -> r.status() == JobStatus.DONE && r.outcome() == null).count();
        return new AiBatchDto(b.getId(), b.getFeature(), b.getPath(), b.getStatus(), b.getAdminId(), b.getTotal(), b.getPauseReason(),
                b.getRetryOf(), c.queued(), c.running(), c.done(), c.empty(), c.badAnswer(), c.failed(), c.canceled(),
                ready, x.retryable(), x.undoable(), x.undoUntil(), b.getCreatedAt(), b.getFinishedAt(), x.spentMinor(), rows);
    }
}
