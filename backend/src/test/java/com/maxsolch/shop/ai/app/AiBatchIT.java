package com.maxsolch.shop.ai.app;

import com.maxsolch.shop.ai.domain.AiError;
import com.maxsolch.shop.ai.domain.AiFeature;
import com.maxsolch.shop.ai.domain.JobMode;
import com.maxsolch.shop.ai.domain.PauseReason;
import com.maxsolch.shop.ai.infra.AiSearchPaceStore;
import com.maxsolch.shop.catalog.domain.Product;
import com.maxsolch.shop.catalog.domain.SpecsJson;
import com.maxsolch.shop.it.AbstractMysqlIT;
import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.platform.security.AdminAccess;
import com.maxsolch.shop.platform.web.CurrentActor;
import com.maxsolch.shop.settings.app.SettingsService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

/**
 * Batches on a real MySQL (V90 is applied by Flyway on a clean MySQL 8.4 when the context starts): the queue does not
 * take the jobs of a paused batch and keeps a batch within its parallelism, a limit hit in the middle pauses the batch
 * with the reserves released and the attempt not counted, the search pacer counts the journal of all instances, and
 * the undo of a safe acceptance gives back only what nobody has edited since.
 */
class AiBatchIT extends AbstractMysqlIT {

    private static final long ADMIN = 7L;

    @Autowired
    AiBatchStarter starter;
    @Autowired
    AiJobLifecycle lifecycle;
    @Autowired
    AiJobRunner runner;
    @Autowired
    AiLimits limits;
    @Autowired
    AiBatchControls controls;
    @Autowired
    AiSafeAccept safe;
    @Autowired
    AiApplyUndo undo;
    @Autowired
    AiSearchPacer pacer;
    @Autowired
    AiSearchPaceStore paceStore;
    @Autowired
    SettingsService settings;

    @MockitoBean
    AiAgent agent;
    @MockitoBean
    CurrentActor actor;
    @MockitoBean
    AdminAccess access;

    @BeforeEach
    void setUp() {
        jdbc.update("delete from ai_reserve");
        jdbc.update("update ai_jobs set status = 'CANCELED', finished_at = now(6) where status in ('QUEUED', 'RUNNING')");
        jdbc.update("update ai_batches set status = 'CANCELED', finished_at = now(6) where status in ('RUNNING', 'PAUSED')");
        when(actor.userId()).thenReturn(ADMIN);
        when(access.canSeeFinance(ADMIN)).thenReturn(true);
        when(agent.configured()).thenReturn(true);
        Map<String, Object> on = new HashMap<>();
        on.put(AiSettings.ENABLED, true);
        on.put(AiSettings.FEATURE_CARD, true);
        on.put(AiSettings.MONTH_LIMIT_CENTS, 0);
        on.put(AiSettings.DAY_LIMIT_CENTS, 0);
        settings.update(on);
    }

    @AfterEach
    void cleanUp() {
        jdbc.update("delete from ai_reserve");
        jdbc.update("delete from ai_search_rest");
        Map<String, Object> reset = new HashMap<>();
        reset.put(AiSettings.FEATURE_CARD, null);
        reset.put(AiSettings.MONTH_LIMIT_CENTS, null);
        reset.put(AiSettings.DAY_LIMIT_CENTS, null);
        settings.update(reset);
    }

    private static String subject() {
        return "it-" + UUID.randomUUID().toString().substring(0, 12);
    }

    private long batchOf(int n) {
        List<AiBatchStarter.Item> items = new ArrayList<>();
        for (int i = 0; i < n; i++) {
            items.add(new AiBatchStarter.Item("PRODUCT", subject(), "v1", "prompt", JobMode.NORMAL, "low", 1, null));
        }
        return starter.start(new AiBatchStarter.Plan(AiFeature.CARD, ADMIN, null, null, "it", items)).getId();
    }

    private String batchStatus(long id) {
        return jdbc.queryForObject("select status from ai_batches where id = ?", String.class, id);
    }

    private List<String> jobStatuses(long batchId) {
        return jdbc.queryForList("select status from ai_jobs where batch_id = ? order by id", String.class, batchId);
    }

    @Test
    void aBatchIsWrittenWithAllItsJobsOrNotAtAll() {
        String clash = subject();
        lifecycle.insert(new com.maxsolch.shop.ai.domain.AiJob.Spec(AiFeature.CARD, ADMIN, "PRODUCT", clash, null,
                JobMode.NORMAL, "low", 1, "it", null, null), "p");
        List<AiBatchStarter.Item> items = List.of(
                new AiBatchStarter.Item("PRODUCT", subject(), "v1", "p", JobMode.NORMAL, "low", 1, null),
                new AiBatchStarter.Item("PRODUCT", clash, "v1", "p", JobMode.NORMAL, "low", 1, null));
        int before = jdbc.queryForObject("select count(*) from ai_batches", Integer.class);

        assertThatThrownBy(() -> starter.start(new AiBatchStarter.Plan(AiFeature.CARD, ADMIN, null, null, "it", items)))
                .isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);

        assertThat(jdbc.queryForObject("select count(*) from ai_batches", Integer.class)).isEqualTo(before);
    }

    @Test
    void aBigBatchRunsAtMostTwoJobsAtOnceAndAPausedOneNoneAtAll() {
        long batch = batchOf(24);

        List<AiJobLifecycle.Claimed> first = lifecycle.claimNext("it-w1", 3);
        assertThat(first).hasSize(2);

        // the third slot stays free for single tasks: nothing more from this batch while two of it run
        assertThat(lifecycle.claimNext("it-w2", 3)).isEmpty();

        controls.pause(batch);
        jdbc.update("update ai_jobs set status = 'DONE', finished_at = now(6) where batch_id = ? and status = 'RUNNING'", batch);
        assertThat(lifecycle.claimNext("it-w3", 3)).isEmpty();

        controls.resume(batch);
        assertThat(lifecycle.claimNext("it-w4", 3)).hasSize(2);
    }

    @Test
    void aLimitInTheMiddlePausesTheBatchReleasesTheReservesAndKeepsTheAttempts() {
        settings.update(Map.of(AiSettings.DAY_LIMIT_CENTS, 1));
        long batch = batchOf(3);
        when(agent.ask(any())).thenAnswer(call -> {
            // the first job spends more than the day allows
            jdbc.update("insert into ai_usage (created_at, feature, kind, provider, result, cost_micro_usd) "
                    + "values (?, 'CARD', 'MODEL', 'it', 'OK', 50000)", java.sql.Timestamp.from(Instant.now()));
            return new AiAgent.Answer("no block", "it", 50_000, null, 1, 0, 0, false, 1);
        });

        List<AiJobLifecycle.Claimed> claimed = lifecycle.claimNext("it-limit", 3);
        claimed.forEach(c -> runner.run("it-limit", c));

        assertThat(batchStatus(batch)).isEqualTo("PAUSED");
        assertThat(jdbc.queryForObject("select pause_reason from ai_batches where id = ?", String.class, batch))
                .isEqualTo(PauseReason.LIMIT_DAY.name());
        assertThat(jobStatuses(batch)).contains("QUEUED");
        assertThat(jdbc.queryForObject("select count(*) from ai_reserve", Integer.class)).isZero();
        assertThat(jdbc.queryForObject("select max(attempts) from ai_jobs where batch_id = ? and status = 'QUEUED'",
                Integer.class, batch)).isZero();
        // nothing continues by itself, and a person cannot continue while the limit is used up
        assertThat(lifecycle.claimNext("it-limit-2", 3)).isEmpty();
        assertThatThrownBy(() -> controls.resume(batch)).isInstanceOf(DomainException.class)
                .satisfies(e -> assertThat(((DomainException) e).errorCode()).isEqualTo(AiError.DAY_LIMIT));
    }

    @Test
    void aRestartPutsTheBatchOnPauseAndTheJobsBackInTheQueue() {
        long batch = batchOf(3);
        lifecycle.claimNext("it-dead", 3);
        jdbc.update("update ai_jobs set heartbeat_at = date_sub(now(6), interval 5 minute) where batch_id = ? and status = 'RUNNING'", batch);

        assertThat(lifecycle.reap()).isEqualTo(3);

        assertThat(batchStatus(batch)).isEqualTo("PAUSED");
        assertThat(jdbc.queryForObject("select pause_reason from ai_batches where id = ?", String.class, batch))
                .isEqualTo(PauseReason.RESTART.name());
        assertThat(jobStatuses(batch)).containsOnly("QUEUED");
        assertThat(lifecycle.claimNext("it-new", 3)).isEmpty();
    }

    @Test
    void thePacerCountsTheJournalOfAllInstancesAndTheRestIsInTheDatabase() {
        settings.update(Map.of(AiSettings.SEARCH_PACE, 3));
        Instant now = Instant.now();
        for (int i = 0; i < 3; i++) {
            jdbc.update("insert into ai_usage (created_at, feature, kind, provider, result) values (?, 'CARD', 'SEARCH', 'it', 'OK')",
                    java.sql.Timestamp.from(now.minusSeconds(299 - i)));
        }
        assertThat(paceStore.requestsSince(now.minusSeconds(300))).isGreaterThanOrEqualTo(3);

        long started = System.nanoTime();
        pacer.acquire();
        long waitedMs = (System.nanoTime() - started) / 1_000_000;
        // the oldest request leaves the five minutes in a second or so: the call waited, but not for minutes
        assertThat(waitedMs).isBetween(500L, 20_000L);

        pacer.rest("it-provider", "down");
        assertThat(pacer.resting("it-provider")).isTrue();
        pacer.wake("it-provider");
        assertThat(pacer.resting("it-provider")).isFalse();
        settings.update(Map.of(AiSettings.SEARCH_PACE, 40));
        jdbc.update("delete from ai_usage where provider = 'it'");
    }

    @Test
    void undoGivesBackOnlyWhatNobodyHasEditedSince() {
        Product p = product(1000, 1);
        long job = readyJobOf(id(p));

        AiSafeAccept.Begun begun = safe.begin(job);
        tx.executeWithoutResult(s -> {
            Product fresh = products.findById(p.getId()).orElseThrow();
            fresh.redescribe("Описание от ИИ");
            fresh.changeSpecs(SpecsJson.write(specs(800, 54)));
            products.save(fresh);
        });
        AiSafeAccept.Applied applied = safe.finish(begun.id());

        assertThat(applied.notSafe()).isEmpty();
        assertThat(applied.changed()).containsExactlyInAnyOrder("description", "spec:dpi", "spec:weight");
        assertThat(applied.undoUntil()).isNotNull();

        // somebody corrects the weight by hand
        tx.executeWithoutResult(s -> {
            Product fresh = products.findById(p.getId()).orElseThrow();
            fresh.changeSpecs(SpecsJson.write(specs(800, 55)));
            products.save(fresh);
        });
        AiApplyUndo.Result result = undo.undo(begun.id());

        assertThat(result.reverted()).isEqualTo(2);
        assertThat(result.skipped()).isEqualTo(1);
        Product after = products.findById(p.getId()).orElseThrow();
        assertThat(after.getDescription()).isNull();
        assertThat(SpecsJson.readMap(after.getSpecsJson())).containsOnlyKeys("weight").containsEntry("weight", 55);
        // the window is closed after one undo
        assertThatThrownBy(() -> undo.undo(begun.id())).isInstanceOf(DomainException.class)
                .satisfies(e -> assertThat(((DomainException) e).errorCode()).isEqualTo(AiError.UNDO_CLOSED));
    }

    @Test
    void anApplicationThatReplacesAFilledFieldIsGivenBackAtOnce() {
        Product p = product(1000, 1);
        tx.executeWithoutResult(s -> {
            Product fresh = products.findById(p.getId()).orElseThrow();
            fresh.redescribe("Описание владельца");
            products.save(fresh);
        });
        long job = readyJobOf(id(p));

        AiSafeAccept.Begun begun = safe.begin(job);
        tx.executeWithoutResult(s -> {
            Product fresh = products.findById(p.getId()).orElseThrow();
            fresh.redescribe("Другое описание");
            fresh.changeSpecs(SpecsJson.write(specs(800, 54)));
            products.save(fresh);
        });
        AiSafeAccept.Applied applied = safe.finish(begun.id());

        assertThat(applied.notSafe()).containsExactly("description");
        assertThat(applied.undoUntil()).isNull();
        Product after = products.findById(p.getId()).orElseThrow();
        assertThat(after.getDescription()).isEqualTo("Описание владельца");
        assertThat(SpecsJson.readMap(after.getSpecsJson())).isEmpty();
    }

    @Test
    void aResultOfAJobThatDidNotSearchIsNotEligible() {
        Product p = product(1000, 1);
        long job = readyJobOf(id(p));
        jdbc.update("update ai_jobs set searches = 0 where id = ?", job);

        assertThatThrownBy(() -> safe.begin(job)).isInstanceOf(DomainException.class)
                .satisfies(e -> assertThat(((DomainException) e).errorCode()).isEqualTo(AiError.NOT_SAFE));
    }

    /** A finished DONE job of a batch for the product, as the review feed would offer it. */
    private long readyJobOf(String productId) {
        List<AiBatchStarter.Item> items = List.of(
                new AiBatchStarter.Item("PRODUCT", productId, "v1", "prompt", JobMode.NORMAL, "low", 1, null));
        long batch = starter.start(new AiBatchStarter.Plan(AiFeature.CARD, ADMIN, null, null, "it", items)).getId();
        long job = jdbc.queryForObject("select id from ai_jobs where batch_id = ?", Long.class, batch);
        jdbc.update("update ai_jobs set status = 'DONE', searches = 2, started_at = now(6), finished_at = now(6) where id = ?", job);
        return job;
    }

    private static Map<String, Object> specs(int dpi, int weight) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("dpi", dpi);
        m.put("weight", weight);
        return m;
    }

}
