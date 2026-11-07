package com.maxsolch.shop.ai.app;

import com.maxsolch.shop.ai.domain.AiError;
import com.maxsolch.shop.ai.domain.AiFeature;
import com.maxsolch.shop.ai.domain.JobPath;
import com.maxsolch.shop.catalog.domain.Product;
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

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.when;

/**
 * The manual way through ChatGPT as tasks, on a real MySQL (V92): with the AI switched off a pasted answer becomes a
 * finished job of path MANUAL waiting for the review, with no money and no reserve; a manual batch keeps its products
 * and the screen's draft on the server, a newer answer replaces the pending one, «Принять безопасное» takes a pasted
 * answer, the task center lists it, and discarding the batch removes only what nobody has decided on.
 */
class AiManualIT extends AbstractMysqlIT {

    private static final long ADMIN = 7L;
    private static final long OTHER = 8L;

    @Autowired
    AiManualBatches manual;
    @Autowired
    AiPastedJobs pasted;
    @Autowired
    AiSafeAccept safe;
    @Autowired
    AiBatchReads batchReads;
    @Autowired
    AiBatchControls controls;
    @Autowired
    AiJobs jobs;
    @Autowired
    AiOutcome outcome;
    @Autowired
    AiTaskList tasks;
    @Autowired
    SettingsService settings;

    @MockitoBean
    CurrentActor actor;
    @MockitoBean
    AdminAccess access;

    @BeforeEach
    void setUp() {
        jdbc.update("update ai_batches set status = 'CANCELED', finished_at = now(6) where status in ('RUNNING', 'PAUSED')");
        as(ADMIN);
        Map<String, Object> off = new HashMap<>();
        off.put(AiSettings.ENABLED, false);
        settings.update(off);
    }

    @AfterEach
    void cleanUp() {
        Map<String, Object> reset = new HashMap<>();
        reset.put(AiSettings.ENABLED, null);
        settings.update(reset);
    }

    private void as(long admin) {
        when(actor.userId()).thenReturn(admin);
        when(access.canSeeFinance(admin)).thenReturn(false);
    }

    private ManualBatchDto batchOf(Product... ps) {
        List<ManualBatchDto.Item> items = java.util.Arrays.stream(ps).map(p -> new ManualBatchDto.Item(id(p), "v1")).toList();
        return manual.create(new AiManualBatches.Start(AiFeature.COMPLETION, "PRODUCT", items, 4, "{\"part\":0}"));
    }

    private static AiManualBatches.Answers part(List<Product> part, Map<Product, String> answers) {
        List<AiManualBatches.Answer> list = answers.entrySet().stream()
                .map(e -> new AiManualBatches.Answer(id(e.getKey()), "v1", e.getValue())).toList();
        return new AiManualBatches.Answers("prompt of the part", "card-v1", part.stream().map(AbstractMysqlIT::id).toList(), list);
    }

    @Test
    void aPastedAnswerIsAFinishedTaskWithoutMoneyEvenWithTheAiOff() {
        Product p = product(1000, 1);

        AiJobDto job = pasted.single(new AiPastedJobs.Paste(AiFeature.COMPLETION, "PRODUCT", id(p), "v1", "card-v1",
                "prompt", "{\"specs\":{}}"));

        assertThat(job.path()).isEqualTo(JobPath.MANUAL);
        assertThat(job.status().name()).isEqualTo("DONE");
        assertThat(job.outcome()).isNull();
        assertThat(job.answer()).isEqualTo("{\"specs\":{}}");
        assertThat(job.errorCode()).isEqualTo("OFF");
        assertThat(jdbc.queryForObject("select coalesce(cost_micro_usd, 0) from ai_jobs where id = ?", Long.class, job.id())).isZero();
        assertThat(jdbc.queryForObject("select count(*) from ai_reserve where job_id = ?", Integer.class, job.id())).isZero();

        // a newer paste of the same product replaces the undecided one
        AiJobDto again = pasted.single(new AiPastedJobs.Paste(AiFeature.COMPLETION, "PRODUCT", id(p), "v2", "card-v1",
                "prompt", "{\"specs\":{\"dpi\":800}}"));
        assertThat(again.id()).isEqualTo(job.id());
        assertThat(again.subjectVersion()).isEqualTo("v2");
        assertThat(again.answer()).contains("800");

        // the review list of «ИИ-задачи» has it; «Повторить тщательнее» has nothing to repeat
        assertThat(tasks.page("REVIEW", 0, 50).items()).anyMatch(r -> r.job().id() == job.id());
        assertThatThrownBy(() -> jobs.retry(job.id())).isInstanceOf(DomainException.class)
                .satisfies(e -> assertThat(((DomainException) e).errorCode()).isEqualTo(AiError.BAD_STATE));

        // decided: the next paste is a new task
        outcome.record(job.id(), new com.maxsolch.shop.ai.domain.AiJob.Outcome(1, 0, 0, 0));
        AiJobDto third = pasted.single(new AiPastedJobs.Paste(AiFeature.COMPLETION, "PRODUCT", id(p), "v3", "card-v1",
                "prompt", "{}"));
        assertThat(third.id()).isNotEqualTo(job.id());
    }

    @Test
    void aManualBatchKeepsItsProductsAndDraftAndOneAnswerPerProduct() {
        Product a = product(1000, 1);
        Product b = product(1000, 1);
        ManualBatchDto created = batchOf(a, b);
        long id = created.batch().id();

        assertThat(created.batch().path()).isEqualTo(JobPath.MANUAL);
        assertThat(created.items()).extracting(ManualBatchDto.Item::subjectId).containsExactly(id(a), id(b));
        assertThat(manual.current()).get().satisfies(c -> assertThat(c.batch().id()).isEqualTo(id));
        // one open manual batch per admin
        assertThatThrownBy(() -> batchOf(a)).isInstanceOf(DomainException.class)
                .satisfies(e -> assertThat(((DomainException) e).errorCode()).isEqualTo(AiError.MANUAL_BATCH_OPEN));

        manual.saveDraft(id, "{\"part\":1}");
        ManualBatchDto first = manual.answers(id, part(List.of(a, b), Map.of(a, "{\"a\":1}", b, "{\"b\":1}")));
        assertThat(first.draft()).isEqualTo("{\"part\":1}");
        assertThat(first.batch().jobs()).hasSize(2);
        assertThat(first.batch().ready()).isEqualTo(2);

        // the part pasted again without b: a gets the newer answer, b's pending task goes away
        ManualBatchDto second = manual.answers(id, part(List.of(a, b), Map.of(a, "{\"a\":2}")));
        assertThat(second.batch().jobs()).hasSize(1);
        long jobA = second.batch().jobs().get(0).id();
        assertThat(jdbc.queryForObject("select answer from ai_job_bodies where job_id = ?", String.class, jobA)).isEqualTo("{\"a\":2}");

        // another admin neither sees nor writes into it
        as(OTHER);
        assertThat(batchReads.active(OTHER, false)).noneMatch(x -> x.id() == id);
        assertThatThrownBy(() -> manual.saveDraft(id, "{}")).isInstanceOf(DomainException.class);
        as(ADMIN);
        assertThat(batchReads.active(ADMIN, false)).anyMatch(x -> x.id() == id);
        // the AI batch buttons are not for it
        assertThatThrownBy(() -> controls.pause(id)).isInstanceOf(DomainException.class)
                .satisfies(e -> assertThat(((DomainException) e).errorCode()).isEqualTo(AiError.BAD_STATE));

        ManualBatchDto done = manual.finish(id);
        assertThat(done.batch().status().name()).isEqualTo("DONE");
        assertThat(manual.current()).isEmpty();
    }

    @Test
    void aPastedAnswerOfABatchCanBeTakenSafelyAndDiscardKeepsWhatWasDecided() {
        Product a = product(1000, 1);
        Product b = product(1000, 1);
        long id = batchOf(a, b).batch().id();
        ManualBatchDto filled = manual.answers(id, part(List.of(a, b), Map.of(a, "{}", b, "{}")));
        long jobA = filled.batch().jobs().stream().filter(r -> r.subjectId().equals(id(a))).findFirst().orElseThrow().id();

        AiSafeAccept.Begun begun = safe.begin(jobA);
        tx.executeWithoutResult(s -> {
            Product fresh = products.findById(a.getId()).orElseThrow();
            fresh.redescribe("Описание из ChatGPT");
            products.save(fresh);
        });
        AiSafeAccept.Applied applied = safe.finish(begun.id());
        assertThat(applied.notSafe()).isEmpty();
        assertThat(applied.changed()).containsExactly("description");
        assertThat(applied.undoUntil()).isNotNull();

        ManualBatchDto gone = manual.discard(id);
        assertThat(gone.batch().status().name()).isEqualTo("CANCELED");
        // the applied one stays (its undo still works), the undecided one of b is removed
        assertThat(gone.batch().jobs()).extracting(AiBatchDto.Row::id).containsExactly(jobA);
        assertThat(gone.batch().undoable()).isEqualTo(1);
    }
}
