package com.maxsolch.shop.ai.app;

import com.maxsolch.shop.ai.domain.AiFeature;
import com.maxsolch.shop.ai.domain.AiJob;
import com.maxsolch.shop.ai.domain.JobMode;
import com.maxsolch.shop.ai.domain.JobStatus;
import com.maxsolch.shop.catalog.domain.Product;
import com.maxsolch.shop.it.AbstractMysqlIT;
import com.maxsolch.shop.settings.app.SettingsService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.util.HashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * V92 on a real MySQL: the snapshot of the card is taken with the job and kept on the server (a retry keeps the one of
 * the job it repeats), the review of a finished job gets the changed fields and who edited the card from the audit;
 * the step of a running job is written by the worker that holds it and shows only while the job runs.
 */
class AiJobConflictIT extends AbstractMysqlIT {

    @Autowired
    AiJobLifecycle lifecycle;
    @Autowired
    AiJobReads reads;

    @Autowired
    SettingsService settings;

    @BeforeEach
    void noActiveJobs() {
        jdbc.update("update ai_jobs set status = 'CANCELED', finished_at = now(6) where status in ('QUEUED', 'RUNNING')");
        Map<String, Object> on = new HashMap<>();
        on.put(AiSettings.ENABLED, true);
        on.put(AiSettings.FEATURE_COMPLETION, true);
        settings.update(on);
    }

    @AfterEach
    void switchOff() {
        Map<String, Object> reset = new HashMap<>();
        reset.put(AiSettings.FEATURE_COMPLETION, null);
        settings.update(reset);
    }

    private AiJob queue(String subject, Long retryOf) {
        return lifecycle.insert(new AiJob.Spec(AiFeature.COMPLETION, 71L, "PRODUCT", subject, "v1", JobMode.NORMAL,
                "medium", 1, "card-v1", null, retryOf), "prompt " + subject);
    }

    private String snapshot(long jobId) {
        return jdbc.queryForObject("select subject_snapshot from ai_job_bodies where job_id = ?", String.class, jobId);
    }

    private void specs(Product p, String json) {
        jdbc.update("update products set specs = ? where id = ?", json, p.getId());
    }

    private void done(long jobId) {
        jdbc.update("update ai_jobs set status = 'DONE', finished_at = now(6), locked_by = null where id = ?", jobId);
    }

    @Test
    void theReviewGetsTheChangedFieldsAndWhoEditedTheCard() {
        Product p = product(100_00, 1);
        specs(p, "{\"weight\": 60, \"dpi\": 26000}");
        AiJob job = queue(id(p), null);
        assertThat(snapshot(job.getId())).contains("\"spec:weight\":\"60\"").contains("\"spec:dpi\":\"26000\"");

        specs(p, "{\"weight\": 62, \"dpi\": 26000}");
        jdbc.update("""
                insert into admin_audit_log (admin_id, admin_name, action, entity_type, entity_id, details, created_at)
                values (71, 'Иван', 'PRODUCT_UPDATE', 'PRODUCT', ?, 'it', now())""", id(p));
        jdbc.update("""
                insert into admin_audit_log (admin_id, admin_name, action, entity_type, entity_id, details, created_at)
                values (72, 'Анна', 'PRODUCT_ACTIVE', 'PRODUCT', ?, 'показан', now())""", id(p));
        done(job.getId());

        AiJobDto dto = reads.read(job.getId(), 0L, true).orElseThrow();

        assertThat(dto.subjectChanges().fields()).containsExactly(new AiJobDto.Change("spec:weight", "60", "62"));
        assertThat(dto.subjectChanges().editors()).extracting(AiJobDto.Editor::name).containsExactly("Иван");
        assertThat(reads.active(true)).allSatisfy(row -> assertThat(row.subjectChanges()).isNull());
    }

    @Test
    void aRetryKeepsTheSnapshotOfTheJobItRepeats() {
        Product p = product(100_00, 1);
        specs(p, "{\"weight\": 60}");
        AiJob first = queue(id(p), null);
        done(first.getId());
        specs(p, "{\"weight\": 61}");

        AiJob retry = queue(id(p), first.getId());

        assertThat(snapshot(retry.getId())).isEqualTo(snapshot(first.getId())).contains("\"spec:weight\":\"60\"");
    }

    @Test
    void anObjectWithoutAPortOrAMalformedIdHasNoSnapshotAndTheJobIsStillCreated() {
        AiJob job = queue("it-not-a-uuid", null);

        assertThat(snapshot(job.getId())).isNull();
        assertThat(jdbc.queryForObject("select status from ai_jobs where id = ?", String.class, job.getId()))
                .isEqualTo("QUEUED");
    }

    @Test
    void theStepIsWrittenByTheHolderAndShownOnlyWhileTheJobRuns() {
        Product p = product(100_00, 1);
        AiJob job = queue(id(p), null);
        assertThat(lifecycle.claimNext("it-step-w", 5)).extracting(c -> c.job().getId()).contains(job.getId());

        lifecycle.step(job.getId(), "it-step-w", "Ищу: viper v3 pro specs");
        lifecycle.step(job.getId(), "it-other-w", "Чужой шаг");
        assertThat(reads.read(job.getId(), 0L, false).orElseThrow().step()).isEqualTo("Ищу: viper v3 pro specs");
        assertThat(reads.active(false)).filteredOn(j -> j.id() == job.getId())
                .extracting(AiJobDto::step).containsExactly("Ищу: viper v3 pro specs");

        lifecycle.step(job.getId(), "it-step-w", "Пишу ответ " + "x".repeat(300));
        assertThat(reads.read(job.getId(), 0L, false).orElseThrow().step()).hasSize(AiJobLifecycle.STEP_LENGTH)
                .startsWith("Пишу ответ").endsWith("…");

        lifecycle.complete(job.getId(), "it-step-w", JobStatus.EMPTY, "", false);
        assertThat(reads.read(job.getId(), 0L, false).orElseThrow().step()).isNull();
    }
}
