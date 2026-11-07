package com.maxsolch.shop.ai.app;

import com.maxsolch.shop.ai.app.AiJobLifecycle.Claimed;
import com.maxsolch.shop.ai.infra.AiProperties;
import com.maxsolch.shop.platform.jobs.DbLocks;
import com.maxsolch.shop.platform.jobs.Workers;
import jakarta.annotation.PreDestroy;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;

/**
 * The executor of the queue in {@code ai_jobs}: every 2 seconds it takes queued jobs while fewer than {@link #SLOTS}
 * run in the whole system (counted in the database under a lock, so two instances do not add up to six), runs each on
 * its own thread, and every 15 seconds says "alive" for the jobs it holds. On a clean stop it gives its running jobs
 * back to the queue; if the whole instance dies, the reaper does the same after a minute of silence.
 * Off with {@code app.ai.worker-enabled=false} (integration tests that drive the queue by hand).
 */
@Slf4j
@Component
public class AiJobWorker {

    static final int SLOTS = 3;
    private static final String CLAIM_LOCK = "ai-claim";

    private final AiJobLifecycle lifecycle;
    private final AiJobRunner runner;
    private final AiProperties props;
    private final DbLocks locks;
    private final Workers workers;
    private final String id = "ai-" + UUID.randomUUID().toString().substring(0, 8);
    private ExecutorService pool;
    private ScheduledExecutorService ticker;

    public AiJobWorker(AiJobLifecycle lifecycle, AiJobRunner runner, AiProperties props, DbLocks locks,
                       Workers workers) {
        this.lifecycle = lifecycle;
        this.runner = runner;
        this.props = props;
        this.locks = locks;
        this.workers = workers;
    }

    public String id() {
        return id;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void start() {
        if (!props.isWorkerEnabled()) {
            return;
        }
        pool = workers.pool("ai", SLOTS, 2 * SLOTS, new ThreadPoolExecutor.AbortPolicy());
        ticker = workers.scheduled("ai-queue");
        ticker.scheduleWithFixedDelay(this::pollQuietly, 2, 2, TimeUnit.SECONDS);
        ticker.scheduleWithFixedDelay(this::beatQuietly, 15, 15, TimeUnit.SECONDS);
    }

    /** Takes what fits and starts it; returns how many were started. */
    public int poll() {
        try (DbLocks.Held ignored = locks.tryLock(CLAIM_LOCK, Duration.ofSeconds(30)).orElse(null)) {
            if (ignored == null) {
                return 0;
            }
            List<Claimed> taken = lifecycle.claimNext(id, SLOTS - lifecycle.running());
            taken.forEach(this::submit);
            return taken.size();
        }
    }

    private void submit(Claimed claimed) {
        try {
            pool.execute(() -> runner.run(id, claimed));
        } catch (RejectedExecutionException e) {
            lifecycle.releaseWorker(id);
        }
    }

    private void pollQuietly() {
        try {
            poll();
        } catch (RuntimeException e) {
            log.warn("ai queue poll failed: {}", e.toString());
        }
    }

    private void beatQuietly() {
        try {
            lifecycle.heartbeat(id);
        } catch (RuntimeException e) {
            log.warn("ai heartbeat failed: {}", e.toString());
        }
    }

    @PreDestroy
    void stop() {
        if (ticker == null) {
            return;
        }
        ticker.shutdownNow();
        try {
            int given = lifecycle.releaseWorker(id);
            if (given > 0) {
                log.info("ai worker {} stopped, {} running jobs given back", id, given);
            }
        } catch (RuntimeException e) {
            log.warn("ai worker {} could not give its jobs back: {}", id, e.toString());
        }
    }
}
