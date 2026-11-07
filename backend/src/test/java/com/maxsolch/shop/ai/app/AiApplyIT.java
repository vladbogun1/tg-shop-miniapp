package com.maxsolch.shop.ai.app;

import com.maxsolch.shop.ai.domain.AiError;
import com.maxsolch.shop.ai.domain.AiFeature;
import com.maxsolch.shop.ai.domain.AiJob;
import com.maxsolch.shop.ai.domain.JobMode;
import com.maxsolch.shop.catalog.domain.Product;
import com.maxsolch.shop.catalog.domain.SpecsJson;
import com.maxsolch.shop.it.AbstractMysqlIT;
import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.platform.security.AdminAccess;
import com.maxsolch.shop.platform.web.CurrentActor;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.when;

/**
 * An ordinary application of a result (the review screen, «Принять» in the feed) goes through the same log as the safe
 * acceptance: it may replace and remove fields (the promise is not checked), it is undoable for 24 hours, an undo gives
 * removed characteristics back, and the job waits for a review again.
 */
class AiApplyIT extends AbstractMysqlIT {

    private static final long ADMIN = 7L;

    @Autowired
    AiSafeAccept apply;
    @Autowired
    AiApplyUndo undo;
    @Autowired
    AiOutcome outcome;
    @Autowired
    AiBatchStarter starter;
    @Autowired
    AiBatchReads batchReads;

    @MockitoBean
    AiAgent agent;
    @MockitoBean
    CurrentActor actor;
    @MockitoBean
    AdminAccess access;

    @BeforeEach
    void setUp() {
        when(actor.userId()).thenReturn(ADMIN);
        when(access.canSeeFinance(ADMIN)).thenReturn(true);
    }

    @Test
    void aReplacingApplicationIsUndoneWithTheRemovedCharacteristicsAndTheJobIsReviewedAgain() {
        Product p = productWith(specs(800, 54));
        long job = readyJobOf(id(p));

        AiSafeAccept.Begun begun = apply.beginSingle(job);
        writeSpecs(p, Map.of("dpi", 26000));
        AiSafeAccept.Applied applied = apply.finish(begun.id());
        outcome.record(job, new AiJob.Outcome(1, 0, 0, 0));

        // replaced and removed: not «safe», but an ordinary application is not checked against that promise
        assertThat(applied.notSafe()).isEmpty();
        assertThat(applied.changed()).containsExactlyInAnyOrder("spec:dpi", "spec:weight");
        assertThat(applied.undoUntil()).isNotNull();
        assertThat(undo.live(job).id()).isEqualTo(begun.id());

        AiApplyUndo.Result r = undo.undo(begun.id());

        assertThat(r.reverted()).isEqualTo(2);
        assertThat(SpecsJson.readMap(products.findById(p.getId()).orElseThrow().getSpecsJson()))
                .containsEntry("dpi", 800).containsEntry("weight", 54);
        assertThat(jdbc.queryForObject("select outcome from ai_jobs where id = ?", String.class, job)).isNull();
        assertThat(undo.live(job).id()).isNull();
    }

    @Test
    void theUndoOfABatchTakesItsOrdinaryApplicationsToo() {
        Product p = productWith(specs(800, 54));
        long job = readyJobOf(id(p));
        long batch = jdbc.queryForObject("select batch_id from ai_jobs where id = ?", Long.class, job);

        AiSafeAccept.Begun begun = apply.beginSingle(job);
        writeSpecs(p, specs(900, 54));
        apply.finish(begun.id());

        assertThat(batchReads.read(batch, true).orElseThrow().undoable()).isEqualTo(1);
        AiApplyUndo.Result r = undo.undoBatch(batch);

        assertThat(r.applications()).isEqualTo(1);
        assertThat(SpecsJson.readMap(products.findById(p.getId()).orElseThrow().getSpecsJson())).containsEntry("dpi", 800);
    }

    @Test
    void anOrdinaryApplicationNeedsNoSearchButOnlyOneLiveApplicationAtATime() {
        Product p = productWith(specs(800, 54));
        long job = readyJobOf(id(p));
        jdbc.update("update ai_jobs set searches = 0 where id = ?", job);

        AiSafeAccept.Begun begun = apply.beginSingle(job);
        apply.finish(begun.id());

        assertThatThrownBy(() -> apply.beginSingle(job)).isInstanceOf(DomainException.class)
                .satisfies(e -> assertThat(((DomainException) e).errorCode()).isEqualTo(AiError.ALREADY_APPLIED));
        undo.undo(begun.id());
        assertThat(apply.beginSingle(job).id()).isGreaterThan(begun.id());
    }

    @Test
    void aJobWithoutAResultCannotBeApplied() {
        Product p = productWith(specs(800, 54));
        long job = readyJobOf(id(p));
        jdbc.update("update ai_jobs set status = 'EMPTY' where id = ?", job);

        assertThatThrownBy(() -> apply.beginSingle(job)).isInstanceOf(DomainException.class)
                .satisfies(e -> assertThat(((DomainException) e).errorCode()).isEqualTo(AiError.BAD_STATE));
    }

    private Product productWith(Map<String, Object> specs) {
        Product p = product(1000, 1);
        writeSpecs(p, specs);
        return p;
    }

    private void writeSpecs(Product p, Map<String, Object> specs) {
        tx.executeWithoutResult(s -> {
            Product fresh = products.findById(p.getId()).orElseThrow();
            fresh.changeSpecs(SpecsJson.write(specs));
            products.save(fresh);
        });
    }

    /** A finished DONE job of a batch for the product. */
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
