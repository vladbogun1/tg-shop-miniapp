package com.maxsolch.shop.platform.jobs;

import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** The shared worker factory: a named daemon thread, strictly one task at a time, stopped once with the application. */
class WorkersTest {

    @Test
    void workerThreadIsNamedDaemonAndRunsTasksInOrder() throws Exception {
        Workers workers = new Workers();
        ExecutorService worker = workers.single("test-worker");
        AtomicReference<Thread> seen = new AtomicReference<>();
        StringBuilder order = new StringBuilder();

        worker.submit(() -> {
            seen.set(Thread.currentThread());
            order.append('a');
        }).get(5, TimeUnit.SECONDS);
        worker.submit(() -> order.append('b')).get(5, TimeUnit.SECONDS);

        assertThat(seen.get().getName()).isEqualTo("test-worker");
        assertThat(seen.get().isDaemon()).isTrue();
        assertThat(order).hasToString("ab");
        workers.destroy();
    }

    @Test
    void fullBoundedQueueAppliesItsPolicy() throws Exception {
        Workers workers = new Workers();
        ExecutorService worker = workers.bounded("full", 1, (r, e) -> {
            throw new RejectedExecutionException("queue is full");
        }, Duration.ZERO);
        CountDownLatch release = new CountDownLatch(1);
        CountDownLatch started = new CountDownLatch(1);
        worker.execute(() -> {
            started.countDown();
            await(release);
        });
        started.await(5, TimeUnit.SECONDS);
        worker.execute(() -> { });

        assertThatThrownBy(() -> worker.execute(() -> { })).isInstanceOf(RejectedExecutionException.class);
        release.countDown();
        workers.destroy();
    }

    @Test
    void destroyLetsQueuedTasksFinishWithinTheDrainTimeAndInterruptsTheRest() throws Exception {
        Workers workers = new Workers();
        ExecutorService draining = workers.bounded("draining", 10, new ThreadPoolExecutor.AbortPolicy(), Duration.ofSeconds(5));
        ExecutorService hanging = workers.single("hanging");
        AtomicBoolean drained = new AtomicBoolean();
        AtomicBoolean interrupted = new AtomicBoolean();
        CountDownLatch hangingStarted = new CountDownLatch(1);
        draining.execute(() -> sleep(100));
        draining.execute(() -> drained.set(true));
        hanging.execute(() -> {
            hangingStarted.countDown();
            try {
                Thread.sleep(60_000);
            } catch (InterruptedException e) {
                interrupted.set(true);
            }
        });
        hangingStarted.await(5, TimeUnit.SECONDS);

        workers.destroy();

        assertThat(drained).isTrue();
        assertThat(draining.isTerminated()).isTrue();
        assertThat(hanging.awaitTermination(5, TimeUnit.SECONDS)).isTrue();
        assertThat(interrupted).isTrue();
    }

    @Test
    void scheduledWorkerRunsDelayedTasksOnItsOwnThread() throws Exception {
        Workers workers = new Workers();
        AtomicReference<String> thread = new AtomicReference<>();
        workers.scheduled("delayed").schedule(() -> thread.set(Thread.currentThread().getName()), 10, TimeUnit.MILLISECONDS)
                .get(5, TimeUnit.SECONDS);

        assertThat(thread.get()).isEqualTo("delayed");
        workers.destroy();
    }

    private static void await(CountDownLatch latch) {
        try {
            latch.await(5, TimeUnit.SECONDS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    private static void sleep(long ms) {
        try {
            Thread.sleep(ms);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }
}
