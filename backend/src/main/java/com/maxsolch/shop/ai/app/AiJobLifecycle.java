package com.maxsolch.shop.ai.app;

import com.maxsolch.shop.ai.domain.AiError;
import com.maxsolch.shop.ai.domain.AiJob;
import com.maxsolch.shop.ai.domain.AiJobBody;
import com.maxsolch.shop.ai.domain.JobStatus;
import com.maxsolch.shop.ai.domain.JobTotals;
import com.maxsolch.shop.ai.infra.AiJobBodyRepository;
import com.maxsolch.shop.ai.infra.AiJobClaims;
import com.maxsolch.shop.ai.infra.AiJobRepository;
import com.maxsolch.shop.ai.infra.AiUsageQueries;
import com.maxsolch.shop.platform.error.DomainException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

/**
 * Every change of a job's state, one transaction each: the queue (take, return), the end (answer, failure, stop),
 * the reaper. The rule for a job that the server dropped (a restart, a dead instance) is in one place,
 * {@link #interrupted}: the first time it goes back to the queue, the second time it fails with RESTARTED.
 * A call that arrives for a job no longer running here (the reaper or a restart took it) changes nothing.
 */
@Service
public class AiJobLifecycle {

    /** Silence of a worker after which its jobs are taken from it (the heartbeat goes every 15 seconds). */
    public static final Duration SILENCE = Duration.ofSeconds(60);
    static final int MAX_ATTEMPTS = 2;

    /** What a run needs, copied out of the transaction. */
    public record Claimed(AiJob job, String prompt) {
    }

    /** What the gate asks before each model turn. */
    public record Live(JobStatus status, boolean cancelRequested, Instant deadlineAt) {
    }

    private final AiJobRepository jobs;
    private final AiJobBodyRepository bodies;
    private final AiJobClaims claims;
    private final AiUsageQueries usage;
    private final AiPolicy policy;
    private final Clock clock;

    public AiJobLifecycle(AiJobRepository jobs, AiJobBodyRepository bodies, AiJobClaims claims, AiUsageQueries usage,
                          AiPolicy policy, Clock clock) {
        this.jobs = jobs;
        this.bodies = bodies;
        this.claims = claims;
        this.usage = usage;
        this.policy = policy;
        this.clock = clock;
    }

    /** A new job with its prompt. The database refuses a second active job for the object and a repeated key. */
    @Transactional
    public AiJob insert(AiJob.Spec spec, String prompt) {
        Instant now = clock.instant();
        AiJob job = jobs.saveAndFlush(AiJob.queued(spec, now));
        bodies.save(AiJobBody.of(job.getId(), prompt, now));
        return job;
    }

    /**
     * Takes up to {@code max} queued jobs for {@code worker}; the caller holds the claim lock, so the cap on running
     * jobs holds across instances. The ids come back only after the commit.
     */
    @Transactional
    public List<Claimed> claimNext(String worker, int max) {
        if (max <= 0 || !policy.killSwitchOn()) {
            return List.of();
        }
        Instant now = clock.instant();
        List<Claimed> taken = new ArrayList<>();
        for (Long id : claims.lockQueued(max)) {
            AiJob job = jobs.findById(id).orElseThrow();
            if (!policy.featureOn(job.getFeature())) {
                job.fail(AiError.DISABLED.name(), null, JobTotals.NONE, now);
                continue;
            }
            job.claim(worker, now, policy.deadline());
            String prompt = bodies.findById(id).map(AiJobBody::getPrompt).orElse("");
            taken.add(new Claimed(job, prompt));
        }
        return taken;
    }

    public int running() {
        return claims.running();
    }

    @Transactional(readOnly = true)
    public Optional<Live> live(long jobId) {
        return jobs.findById(jobId).map(j -> new Live(j.getStatus(), j.isCancelRequested(), j.getDeadlineAt()));
    }

    /** One heartbeat for all the jobs this worker runs. */
    @Transactional
    public void heartbeat(String worker) {
        jobs.heartbeat(worker, clock.instant());
    }

    /** The run ended with an answer: the verdict of the structural check, the totals from the journal. */
    @Transactional
    public Optional<AiJob> complete(long jobId, String worker, JobStatus verdict, String answer, boolean repaired) {
        return running(jobId, worker).map(job -> {
            job.finish(verdict, totals(jobId, repaired), clock.instant());
            bodies.findById(jobId).ifPresent(b -> b.answered(answer));
            return job;
        });
    }

    @Transactional
    public Optional<AiJob> fail(long jobId, String worker, String code, String note) {
        return running(jobId, worker).map(job -> {
            job.fail(code, note, totals(jobId, false), clock.instant());
            return job;
        });
    }

    @Transactional
    public Optional<AiJob> cancel(long jobId, String worker) {
        return running(jobId, worker).map(job -> {
            job.cancel(totals(jobId, false), clock.instant());
            return job;
        });
    }

    /** The server is stopping: the jobs of this worker go back to the queue (or fail on the second interruption). */
    @Transactional
    public int releaseWorker(String worker) {
        List<AiJob> mine = jobs.findByStatusAndLockedBy(JobStatus.RUNNING, worker);
        mine.forEach(this::interrupted);
        return mine.size();
    }

    /** Jobs whose worker went silent: back to the queue once, then FAILED. */
    @Transactional
    public int reap() {
        List<AiJob> stale = jobs.findByStatusAndHeartbeatAtBefore(JobStatus.RUNNING,
                clock.instant().minus(SILENCE));
        stale.forEach(this::interrupted);
        return stale.size();
    }

    /** The admin's "Остановить": a queued job ends at once, a running one stops before its next turn. */
    @Transactional
    public AiJob requestCancel(long jobId) {
        AiJob job = jobs.findById(jobId).orElseThrow(() -> new DomainException.NotFound(AiError.JOB_NOT_FOUND));
        job.requestCancel(clock.instant());
        return job;
    }

    /** The owner's red button: queued jobs are canceled at once, running ones get the flag and stop before the next turn. */
    @Transactional
    public int stopAll() {
        Instant now = clock.instant();
        int n = 0;
        for (AiJob job : jobs.findByStatusInOrderByIdDesc(List.of(JobStatus.QUEUED, JobStatus.RUNNING))) {
            job.requestCancel(now);
            n++;
        }
        return n;
    }

    /** Prompts and answers older than the retention are deleted; the job keeps its price and outcome. */
    @Transactional
    public int purgeBodies(Duration retention) {
        return bodies.deleteOlderThan(clock.instant().minus(retention));
    }

    private void interrupted(AiJob job) {
        if (job.getAttempts() >= MAX_ATTEMPTS) {
            job.fail(AiError.RESTARTED.name(), null, totals(job.getId(), false), clock.instant());
        } else {
            job.requeue();
        }
    }

    private Optional<AiJob> running(long jobId, String worker) {
        return jobs.findById(jobId)
                .filter(j -> j.getStatus() == JobStatus.RUNNING && worker.equals(j.getLockedBy()));
    }

    private JobTotals totals(long jobId, boolean repaired) {
        return usage.totals(jobId).withRate(policy.rateMilli()).withRepaired(repaired);
    }
}
