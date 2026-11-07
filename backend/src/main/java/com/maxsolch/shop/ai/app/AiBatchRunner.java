package com.maxsolch.shop.ai.app;

import com.maxsolch.shop.ai.domain.AiBatch;
import com.maxsolch.shop.ai.domain.AiEvents;
import com.maxsolch.shop.ai.domain.AiEvents.Period;
import com.maxsolch.shop.ai.domain.AiJob;
import com.maxsolch.shop.ai.domain.BatchStatus;
import com.maxsolch.shop.ai.domain.JobStatus;
import com.maxsolch.shop.ai.domain.PauseReason;
import com.maxsolch.shop.ai.infra.AiBatchQueries;
import com.maxsolch.shop.ai.infra.AiBatchRepository;
import com.maxsolch.shop.ai.infra.AiJobRepository;
import com.maxsolch.shop.platform.tx.DomainEvents;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.util.List;
import java.util.Optional;

/**
 * What happens to a batch while its jobs run — the rules, not the execution (the queue takes the jobs: a job of a
 * paused batch is not taken, at most {@code parallel} jobs of a batch run at once, see {@code AiJobClaims}):
 * <ul>
 *   <li>a job ended: the last one finishes the batch (one push to who started it); three failures in a row, or a search
 *       that has found nothing for several jobs, stop it;</li>
 *   <li>a limit was hit (day, month) or the owner switched the AI off: the batch pauses, the job goes back to the queue,
 *       nothing continues by itself;</li>
 *   <li>the server restarted under a job: the batch pauses («Пауза: сервер перезапускали»).</li>
 * </ul>
 * Every method locks the batch row first, so two jobs ending together do not both announce «done». Pausing a batch
 * that is not running changes nothing: the first reason stays.
 */
@Service
public class AiBatchRunner {

    static final int FAILURES_IN_A_ROW = 3;
    static final int BLIND_JOBS = 4;
    static final int BLIND_MIN_SEARCHES = 6;

    private final AiBatchRepository batches;
    private final AiJobRepository jobs;
    private final AiBatchQueries queries;
    private final DomainEvents events;
    private final Clock clock;

    public AiBatchRunner(AiBatchRepository batches, AiJobRepository jobs, AiBatchQueries queries, DomainEvents events,
                         Clock clock) {
        this.batches = batches;
        this.jobs = jobs;
        this.queries = queries;
        this.events = events;
        this.clock = clock;
    }

    /** A job of the batch has ended (any way). */
    @Transactional
    public void jobEnded(long batchId) {
        Optional<AiBatch> locked = batches.lockById(batchId);
        if (locked.isEmpty() || !locked.get().getStatus().open()) {
            return;
        }
        AiBatch batch = locked.get();
        if (queries.active(batchId) == 0) {
            if (batch.complete(clock.instant())) {
                events.publish(new AiEvents.BatchFinished(batchId, batch.getAdminId(), queries.done(batchId), batch.getTotal()));
            }
            return;
        }
        if (batch.getStatus() == BatchStatus.RUNNING) {
            if (failedInARow(batchId)) {
                stop(batchId, batch, PauseReason.FAILURES);
            } else if (queries.searchBlind(batchId, BLIND_JOBS, BLIND_MIN_SEARCHES)) {
                stop(batchId, batch, PauseReason.SEARCH_DOWN);
            }
        }
    }

    /** A job met a limit: the batch pauses on it. {@code month}: the month limit, else the day limit. */
    @Transactional
    public void limitHit(long batchId, boolean month) {
        batches.lockById(batchId).ifPresent(batch -> {
            if (batch.pause(month ? PauseReason.LIMIT_MONTH : PauseReason.LIMIT_DAY, clock.instant())) {
                events.publish(new AiEvents.BatchStopped(queries.done(batchId), batch.getTotal(),
                        month ? Period.MONTH : Period.DAY));
            }
        });
    }

    /** The owner switched the AI or the feature off, or the server restarted under a job of the batch. */
    @Transactional
    public void paused(long batchId, PauseReason reason) {
        batches.lockById(batchId).ifPresent(batch -> batch.pause(reason, clock.instant()));
    }

    private void stop(long batchId, AiBatch batch, PauseReason reason) {
        if (batch.pause(reason, clock.instant())) {
            events.publish(new AiEvents.BatchProblem(batchId, reason, queries.done(batchId), batch.getTotal()));
        }
    }

    private boolean failedInARow(long batchId) {
        List<AiJob> last = jobs.findTop3ByBatchIdAndFinishedAtIsNotNullOrderByFinishedAtDescIdDesc(batchId);
        return last.size() == FAILURES_IN_A_ROW && last.stream().allMatch(j -> j.getStatus() == JobStatus.FAILED);
    }
}
