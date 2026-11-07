package com.maxsolch.shop.ai.app;

import com.maxsolch.shop.ai.domain.AiError;
import com.maxsolch.shop.ai.domain.AiFeature;
import com.maxsolch.shop.ai.domain.AiJob;
import com.maxsolch.shop.ai.domain.JobMode;
import com.maxsolch.shop.ai.domain.JobStatus;
import com.maxsolch.shop.it.AbstractMysqlIT;
import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.settings.app.SettingsService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataIntegrityViolationException;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * The AI queue on a real MySQL: two executors never take the same job, the reaper gives a silent job back once and then
 * fails it, the reserve does not let parallel starts step over a limit, the database allows one active job per object.
 * The worker of the application is off in integration tests ({@code app.ai.worker-enabled=false}): the queue is driven here.
 */
class AiJobsIT extends AbstractMysqlIT {

    @Autowired
    AiJobLifecycle lifecycle;
    @Autowired
    AiLimits limits;
    @Autowired
    SettingsService settings;
    @Autowired
    AiEstimate estimate;

    @BeforeEach
    void switchOn() {
        jdbc.update("delete from ai_reserve");
        jdbc.update("update ai_jobs set status = 'CANCELED', finished_at = now(6) where status in ('QUEUED', 'RUNNING')");
        Map<String, Object> on = new HashMap<>();
        on.put(AiSettings.ENABLED, true);
        on.put(AiSettings.FEATURE_CARD, true);
        on.put(AiSettings.MONTH_LIMIT_CENTS, 1000);
        on.put(AiSettings.DAY_LIMIT_CENTS, 0);
        settings.update(on);
    }

    @AfterEach
    void cleanUp() {
        jdbc.update("delete from ai_reserve");
        jdbc.update("delete from ai_usage where provider = ?", PAD);
        Map<String, Object> reset = new HashMap<>();
        reset.put(AiSettings.FEATURE_CARD, null);
        reset.put(AiSettings.MONTH_LIMIT_CENTS, null);
        reset.put(AiSettings.DAY_LIMIT_CENTS, null);
        settings.update(reset);
    }

    private static final String PAD = "it-limit-pad";

    /**
     * Sets the month limit so that exactly one more card fits: room = 1.5 reserves. The reserve is the p90 of the
     * history in this database (after e2e runs it can be tiny), so the limit is computed, not a constant, and a padding
     * row in {@code ai_usage} takes up whatever the whole cents leave over.
     */
    private void roomForExactlyOneCard() {
        long reserve = estimate.of(AiFeature.CARD, JobMode.NORMAL, 1).p90MicroUsd();
        long target = limits.spend().monthMicroUsd() + reserve + reserve / 2;
        long cents = (target + 9_999) / 10_000;
        long pad = cents * 10_000 - target;
        jdbc.update("""
                insert into ai_usage (created_at, feature, kind, provider, result, cost_micro_usd)
                values (now(6), 'CARD', 'MODEL', ?, 'OK', ?)""", PAD, pad);
        settings.update(Map.of(AiSettings.MONTH_LIMIT_CENTS, (int) cents));
    }

    private static String subject() {
        return "it-" + UUID.randomUUID().toString().substring(0, 12);
    }

    private AiJob queue(String subject, Long adminId, String idemKey) {
        return lifecycle.insert(new AiJob.Spec(AiFeature.CARD, adminId, "PRODUCT", subject, null, JobMode.NORMAL, "low",
                1, "it", idemKey, null), "prompt " + subject);
    }

    private String status(long id) {
        return jdbc.queryForObject("select status from ai_jobs where id = ?", String.class, id);
    }

    /**
     * Without the claim lock, two claims at the same moment: no job twice, none lost, and neither claim killed as a
     * deadlock. Twenty rounds, both started together: under repeatable read one round in a few ended in a deadlock.
     */
    @Test
    void twoExecutorsNeverTakeTheSameJob() throws Exception {
        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            for (int round = 0; round < 20; round++) {
                claimTogether(pool);
            }
        } finally {
            pool.shutdownNow();
        }
    }

    private void claimTogether(ExecutorService pool) throws Exception {
        List<Long> ids = new ArrayList<>();
        for (int i = 0; i < 6; i++) {
            ids.add(queue(subject(), 71L, null).getId());
        }
        CountDownLatch go = new CountDownLatch(1);
        Callable<List<Long>> a = () -> {
            go.await();
            return lifecycle.claimNext("it-w1", 6).stream().map(c -> c.job().getId()).toList();
        };
        Callable<List<Long>> b = () -> {
            go.await();
            return lifecycle.claimNext("it-w2", 6).stream().map(c -> c.job().getId()).toList();
        };
        Future<List<Long>> fa = pool.submit(a);
        Future<List<Long>> fb = pool.submit(b);
        go.countDown();
        List<Long> first = fa.get();
        List<Long> second = fb.get();

        // one executor may take all six and the other none: AssertJ refuses an empty list here, so intersect by hand
        assertThat(first.stream().filter(second::contains).toList()).isEmpty();
        List<Long> all = new ArrayList<>(first);
        all.addAll(second);
        // whatever was queued before this test was cancelled; the six of this round are all running, once each
        assertThat(all).containsExactlyInAnyOrderElementsOf(ids);
        assertThat(status(ids.get(0))).isEqualTo("RUNNING");
    }

    @Test
    void aSilentJobGoesBackOnceAndThenFailsAsRestarted() {
        AiJob job = queue(subject(), 71L, null);
        lifecycle.claimNext("it-dead", 1);
        jdbc.update("update ai_jobs set heartbeat_at = date_sub(now(6), interval 5 minute) where id = ?", job.getId());

        assertThat(lifecycle.reap()).isEqualTo(1);
        assertThat(status(job.getId())).isEqualTo("QUEUED");

        lifecycle.claimNext("it-dead-2", 1);
        jdbc.update("update ai_jobs set heartbeat_at = date_sub(now(6), interval 5 minute) where id = ?", job.getId());

        assertThat(lifecycle.reap()).isEqualTo(1);
        assertThat(status(job.getId())).isEqualTo("FAILED");
        assertThat(jdbc.queryForObject("select error_code from ai_jobs where id = ?", String.class, job.getId()))
                .isEqualTo(AiError.RESTARTED.name());
    }

    @Test
    void aLiveJobIsNotReaped() {
        AiJob job = queue(subject(), 71L, null);
        lifecycle.claimNext("it-live", 1);
        lifecycle.heartbeat("it-live");

        assertThat(lifecycle.reap()).isZero();
        assertThat(status(job.getId())).isEqualTo("RUNNING");
    }

    @Test
    void aWorkerThatStopsGivesItsJobsBack() {
        AiJob job = queue(subject(), 71L, null);
        lifecycle.claimNext("it-stopping", 1);

        assertThat(lifecycle.releaseWorker("it-stopping")).isEqualTo(1);
        assertThat(status(job.getId())).isEqualTo("QUEUED");
    }

    @Test
    void parallelStartsCannotStepOverTheLimit() throws Exception {
        roomForExactlyOneCard();
        List<AiJob> jobs = new ArrayList<>();
        for (int i = 0; i < 5; i++) {
            jobs.add(queue(subject(), 71L, null));
        }
        ExecutorService pool = Executors.newFixedThreadPool(5);
        try {
            List<Future<Boolean>> results = new ArrayList<>();
            for (AiJob job : jobs) {
                results.add(pool.submit(() -> {
                    try {
                        limits.reserve(job);
                        return true;
                    } catch (DomainException e) {
                        return false;
                    }
                }));
            }
            int granted = 0;
            for (Future<Boolean> r : results) {
                granted += r.get() ? 1 : 0;
            }

            assertThat(granted).isEqualTo(1);
            assertThat(jdbc.queryForObject("select count(*) from ai_reserve", Integer.class)).isEqualTo(1);
        } finally {
            pool.shutdownNow();
        }
    }

    @Test
    void releasingTheReserveMakesRoomForTheNextJob() {
        roomForExactlyOneCard();
        AiJob first = queue(subject(), 71L, null);
        AiJob second = queue(subject(), 71L, null);
        limits.reserve(first);

        assertThatThrownBy(() -> limits.reserve(second)).isInstanceOf(DomainException.class);
        limits.release(first.getId());
        limits.reserve(second);

        assertThat(jdbc.queryForObject("select count(*) from ai_reserve where job_id = ?", Integer.class,
                second.getId())).isEqualTo(1);
    }

    @Test
    void theDatabaseAllowsOneActiveJobPerObject() {
        String subject = subject();
        AiJob first = queue(subject, 71L, null);

        assertThatThrownBy(() -> queue(subject, 72L, null)).isInstanceOf(DataIntegrityViolationException.class);

        first = lifecycle.requestCancel(first.getId());
        assertThat(first.getStatus()).isEqualTo(JobStatus.CANCELED);
        assertThat(queue(subject, 72L, null).getStatus()).isEqualTo(JobStatus.QUEUED);
    }

    @Test
    void oneKeyPerAdminMakesARepeatedStartOneJob() {
        String key = "key-" + UUID.randomUUID();
        queue(subject(), 73L, key);

        assertThatThrownBy(() -> queue(subject(), 73L, key)).isInstanceOf(DataIntegrityViolationException.class);
        // another admin may use the same key text
        assertThat(queue(subject(), 74L, key).getId()).isNotNull();
    }

    @Test
    void aStopFlagIsVisibleToTheRunningJob() {
        AiJob job = queue(subject(), 71L, null);
        lifecycle.claimNext("it-flag", 1);

        lifecycle.requestCancel(job.getId());

        assertThat(lifecycle.live(job.getId()).orElseThrow().cancelRequested()).isTrue();
        assertThat(lifecycle.cancel(job.getId(), "it-flag")).isPresent();
        assertThat(status(job.getId())).isEqualTo("CANCELED");
    }
}
