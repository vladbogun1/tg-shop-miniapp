package com.maxsolch.shop.ai.app;

import com.maxsolch.shop.ai.domain.AiError;
import com.maxsolch.shop.ai.domain.AiFeature;
import com.maxsolch.shop.platform.cache.CacheConfig;
import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.platform.jobs.Workers;
import lombok.extern.slf4j.Slf4j;
import org.springframework.cache.Cache;
import org.springframework.cache.CacheManager;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.time.Instant;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.ThreadPoolExecutor;

/**
 * AI questions run in the background: a researched card takes about a minute, longer than a request should hang
 * (gateway timeouts, a phone going to sleep). The admin starts a job and polls it. 3 at a time, 10 waiting, then
 * «busy». Jobs live in the cache for an hour (ARCHITECTURE.md, section 6: a lost job is asked again, it costs
 * kopecks); a restart loses the running ones — the admin sees «job not found» and presses the button again.
 */
@Slf4j
@Service
public class AiJobs {

    static final int THREADS = 3;
    static final int QUEUE = 10;
    static final int MAX_PROMPT = 200_000;
    static final int MAX_ITEMS = 10;
    private static final Set<String> EFFORTS = Set.of("low", "medium", "high");

    public enum Status { RUNNING, DONE, FAILED }

    /** What the admin sees; {@code answer} is set when DONE. A FAILED job answers with its error instead. */
    public record JobView(String id, AiFeature feature, Status status, Instant startedAt, AiAgent.Answer answer) {
    }

    private record Job(JobView view, DomainException error) {
    }

    private final AiAgent agent;
    private final Cache jobs;
    private final ExecutorService pool;
    private final Clock clock;

    public AiJobs(AiAgent agent, CacheManager caches, Workers workers, Clock clock) {
        this.agent = agent;
        this.jobs = CacheConfig.require(caches, AiCaches.JOBS.name());
        this.pool = workers.pool("ai", THREADS, QUEUE, new ThreadPoolExecutor.AbortPolicy());
        this.clock = clock;
    }

    public JobView start(AiAgent.Ask ask) {
        validate(ask);
        if (!agent.configured()) {
            throw new DomainException.Unavailable(AiError.NOT_CONFIGURED);
        }
        JobView view = new JobView(UUID.randomUUID().toString(), ask.feature(), Status.RUNNING, clock.instant(), null);
        jobs.put(view.id(), new Job(view, null));
        try {
            pool.execute(() -> run(view, ask));
        } catch (RejectedExecutionException e) {
            jobs.evict(view.id());
            throw new DomainException.TooManyRequests(AiError.BUSY, 60);
        }
        return view;
    }

    /** The job; a failed one throws its error, so the admin gets the usual error toast in its language. */
    public JobView get(String id) {
        Job job = jobs.get(id, Job.class);
        if (job == null) {
            throw new DomainException.NotFound(AiError.JOB_NOT_FOUND);
        }
        if (job.error() != null) {
            throw job.error();
        }
        return job.view();
    }

    private void run(JobView started, AiAgent.Ask ask) {
        try {
            AiAgent.Answer answer = agent.ask(ask);
            jobs.put(started.id(), new Job(with(started, Status.DONE, answer), null));
        } catch (DomainException e) {
            jobs.put(started.id(), new Job(with(started, Status.FAILED, null), e));
        } catch (RuntimeException e) {
            log.warn("ai job {} ({}) failed", started.id(), ask.feature(), e);
            jobs.put(started.id(), new Job(with(started, Status.FAILED, null),
                    new DomainException.Unavailable(AiError.MODEL_FAILED, e.getClass().getSimpleName())));
        }
    }

    private static JobView with(JobView v, Status status, AiAgent.Answer answer) {
        return new JobView(v.id(), v.feature(), status, v.startedAt(), answer);
    }

    static void validate(AiAgent.Ask ask) {
        if (ask.feature() == null) {
            throw new DomainException.BadRequest(AiError.BAD_REQUEST, "feature");
        }
        if (ask.prompt() == null || ask.prompt().isBlank() || ask.prompt().length() > MAX_PROMPT) {
            throw new DomainException.BadRequest(AiError.BAD_REQUEST, "prompt");
        }
        if (!EFFORTS.contains(ask.effort())) {
            throw new DomainException.BadRequest(AiError.BAD_REQUEST, "effort");
        }
        if (ask.researchItems() < 0 || ask.researchItems() > MAX_ITEMS) {
            throw new DomainException.BadRequest(AiError.BAD_REQUEST, "researchItems");
        }
    }
}
