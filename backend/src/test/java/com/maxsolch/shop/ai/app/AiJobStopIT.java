package com.maxsolch.shop.ai.app;

import com.maxsolch.shop.ai.domain.AiFeature;
import com.maxsolch.shop.ai.domain.AiJob;
import com.maxsolch.shop.ai.domain.JobMode;
import com.maxsolch.shop.it.AbstractMysqlIT;
import com.maxsolch.shop.platform.security.AdminAccess;
import com.maxsolch.shop.platform.web.CurrentActor;
import com.maxsolch.shop.settings.app.SettingsService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

/**
 * «Остановить» pressed while the model is answering: when the call returns, the job ends CANCELED (not handed to
 * review, nothing written), the money the call cost stays on the job and in the journal, the reserve is released.
 */
class AiJobStopIT extends AbstractMysqlIT {

    private static final long ADMIN = 7L;
    private static final long COST = 70_000;

    @Autowired
    AiJobLifecycle lifecycle;
    @Autowired
    AiJobRunner runner;
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
        jdbc.update("delete from ai_usage where provider = 'it-stop'");
        Map<String, Object> reset = new HashMap<>();
        reset.put(AiSettings.FEATURE_CARD, null);
        reset.put(AiSettings.MONTH_LIMIT_CENTS, null);
        reset.put(AiSettings.DAY_LIMIT_CENTS, null);
        settings.update(reset);
    }

    @Test
    void aStopDuringTheModelCallCancelsTheJobWithTheSpendRecordedAndTheReserveReleased() {
        String subject = "it-" + UUID.randomUUID().toString().substring(0, 12);
        AiJob job = lifecycle.insert(new AiJob.Spec(AiFeature.CARD, ADMIN, "PRODUCT", subject, null, JobMode.NORMAL,
                "low", 1, "it", null, null), "prompt");
        long id = job.getId();
        when(agent.ask(any())).thenAnswer(call -> {
            // the model is answering: the call is paid, and the admin presses «Остановить» meanwhile
            jdbc.update("insert into ai_usage (created_at, feature, kind, provider, result, cost_micro_usd, job_id, admin_id) "
                    + "values (?, 'CARD', 'MODEL', 'it-stop', 'OK', ?, ?, ?)", Timestamp.from(Instant.now()), COST, id, ADMIN);
            assertThat(jdbc.queryForObject("select count(*) from ai_reserve where job_id = ?", Integer.class, id)).isOne();
            lifecycle.requestCancel(id);
            return new AiAgent.Answer("```json\n{}\n```", "it", COST, null, 1, 0, 0, false, 1);
        });

        List<AiJobLifecycle.Claimed> claimed = lifecycle.claimNext("it-stop", 3);
        assertThat(claimed).extracting(c -> c.job().getId()).contains(id);
        claimed.stream().filter(c -> c.job().getId() == id).forEach(c -> runner.run("it-stop", c));

        Map<String, Object> row = jdbc.queryForMap(
                "select status, cost_micro_usd, model_calls, error_code from ai_jobs where id = ?", id);
        assertThat(row.get("status")).isEqualTo("CANCELED");
        assertThat(((Number) row.get("cost_micro_usd")).longValue()).isEqualTo(COST);
        assertThat(((Number) row.get("model_calls")).intValue()).isOne();
        assertThat(jdbc.queryForObject("select answer from ai_job_bodies where job_id = ?", String.class, id)).isNull();
        assertThat(jdbc.queryForObject("select count(*) from ai_reserve where job_id = ?", Integer.class, id)).isZero();
    }

    @Test
    void aStopThatCameAfterTheRunnerLookedIsStillCanceledAtCompletion() {
        String subject = "it-" + UUID.randomUUID().toString().substring(0, 12);
        AiJob job = lifecycle.insert(new AiJob.Spec(AiFeature.CARD, ADMIN, "PRODUCT", subject, null, JobMode.NORMAL,
                "low", 1, "it", null, null), "prompt");
        long id = job.getId();
        assertThat(lifecycle.claimNext("it-stop-2", 3)).extracting(c -> c.job().getId()).contains(id);
        lifecycle.requestCancel(id);

        assertThat(lifecycle.complete(id, "it-stop-2", com.maxsolch.shop.ai.domain.JobStatus.DONE, "answer", false))
                .isEmpty();

        assertThat(jdbc.queryForObject("select status from ai_jobs where id = ?", String.class, id)).isEqualTo("CANCELED");
        assertThat(jdbc.queryForObject("select answer from ai_job_bodies where job_id = ?", String.class, id)).isNull();
    }
}
