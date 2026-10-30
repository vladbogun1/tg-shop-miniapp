package com.maxsolch.shop.platform.jobs;

import org.springframework.beans.factory.DisposableBean;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.RejectedExecutionHandler;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledThreadPoolExecutor;
import java.util.concurrent.ThreadFactory;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

/**
 * The one place that creates threads: named single-thread workers for fire-and-forget work that must not run on the
 * request thread (a Telegram message, a push, a journal write, a call to the public site).
 *
 * <p>Every worker is a daemon thread with the name given by its owner (it shows in thread dumps and logs), runs its
 * tasks strictly one after another, and is stopped here, once, when the application stops: the queue is closed, the
 * running task gets {@code drainOnStop} to finish, then what is left is interrupted. A worker is created by the
 * class that owns the work, but never stopped by it. Work that must not be lost does not belong on a worker at all
 * (it is a row in the database), see ARCHITECTURE.md, section 6.
 */
@Component
public class Workers implements DisposableBean {

    private final AtomicReference<List<Started>> started = new AtomicReference<>(List.of());

    private record Started(ExecutorService executor, Duration drainOnStop) {
    }

    /** One thread, unbounded queue, interrupted on stop. */
    public ExecutorService single(String name) {
        return register(new ThreadPoolExecutor(1, 1, 0, TimeUnit.MILLISECONDS, new LinkedBlockingQueue<>(),
                daemon(name)), Duration.ZERO);
    }

    /**
     * One thread and a queue of {@code capacity}: when it is full {@code onFull} decides (drop the task or throw).
     * Queued tasks get {@code drainOnStop} to run when the application stops.
     */
    public ExecutorService bounded(String name, int capacity, RejectedExecutionHandler onFull, Duration drainOnStop) {
        BlockingQueue<Runnable> queue = new LinkedBlockingQueue<>(capacity);
        return register(new ThreadPoolExecutor(1, 1, 0, TimeUnit.MILLISECONDS, queue, daemon(name), onFull), drainOnStop);
    }

    /** One thread that also runs delayed tasks; interrupted on stop. */
    public ScheduledExecutorService scheduled(String name) {
        return register(new ScheduledThreadPoolExecutor(1, daemon(name)), Duration.ZERO);
    }

    private <E extends ExecutorService> E register(E executor, Duration drainOnStop) {
        Started entry = new Started(executor, drainOnStop);
        started.updateAndGet(list -> {
            List<Started> next = new ArrayList<>(list);
            next.add(entry);
            return List.copyOf(next);
        });
        return executor;
    }

    private static ThreadFactory daemon(String name) {
        return r -> {
            Thread t = new Thread(r, name);
            t.setDaemon(true);
            return t;
        };
    }

    @Override
    public void destroy() {
        List<Started> all = started.getAndSet(List.of());
        all.forEach(s -> s.executor().shutdown());
        for (Started s : all) {
            if (!s.drainOnStop().isZero()) {
                awaitQuietly(s);
            }
            s.executor().shutdownNow();
        }
    }

    private static void awaitQuietly(Started s) {
        try {
            s.executor().awaitTermination(s.drainOnStop().toMillis(), TimeUnit.MILLISECONDS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }
}
