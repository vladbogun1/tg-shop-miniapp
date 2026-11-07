package com.maxsolch.shop.ai.app;

import com.maxsolch.shop.ai.domain.AiBatch;
import com.maxsolch.shop.ai.domain.AiFeature;
import com.maxsolch.shop.ai.domain.AiJob;
import com.maxsolch.shop.ai.domain.JobMode;
import com.maxsolch.shop.ai.infra.AiBatchRepository;
import com.maxsolch.shop.audit.app.AdminAuditService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.util.List;

/**
 * Writes a batch with all its jobs in ONE transaction: either the 30 products are queued or none is (a database
 * refusal of one of them — a second active job for the product, a repeated key — takes the whole batch back).
 * The rules of the front door (who may, what is on, what fits) are in {@link AiBatches}.
 */
@Service
public class AiBatchStarter {

    /** One job of the batch with its own prompt; {@code retryOf} is set when it asks again for an ended job. */
    public record Item(String subjectType, String subjectId, String subjectVersion, String prompt, JobMode mode,
                       String effort, int researchItems, Long retryOf) {
    }

    /** What to write: {@code retryOf} is the batch this one asks again for (null for a new batch). */
    public record Plan(AiFeature feature, long adminId, String idemKey, Long retryOf, String promptVersion,
                       List<Item> items) {
    }

    private final AiBatchRepository batches;
    private final AiJobLifecycle lifecycle;
    private final AdminAuditService audit;
    private final Clock clock;

    public AiBatchStarter(AiBatchRepository batches, AiJobLifecycle lifecycle, AdminAuditService audit, Clock clock) {
        this.batches = batches;
        this.lifecycle = lifecycle;
        this.audit = audit;
        this.clock = clock;
    }

    @Transactional
    public AiBatch start(Plan plan) {
        AiBatch batch = batches.saveAndFlush(AiBatch.started(plan.feature(), plan.adminId(), plan.items().size(),
                plan.idemKey(), plan.retryOf(), clock.instant()));
        for (Item it : plan.items()) {
            AiJob.Spec spec = new AiJob.Spec(plan.feature(), plan.adminId(), it.subjectType(), it.subjectId(),
                    it.subjectVersion(), it.mode(), it.effort(), it.researchItems(), plan.promptVersion(), null,
                    it.retryOf(), batch.getId());
            lifecycle.insert(spec, it.prompt());
        }
        audit.record("AI_BATCH_START", "AI_BATCH", String.valueOf(batch.getId()),
                "ИИ: пакет из " + plan.items().size() + (plan.retryOf() == null ? "" : ", повтор пакета " + plan.retryOf()));
        return batch;
    }
}
