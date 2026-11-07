package com.maxsolch.shop.ai.app;

import com.maxsolch.shop.ai.domain.AiBatch;
import com.maxsolch.shop.ai.domain.AiError;
import com.maxsolch.shop.ai.domain.AiJob;
import com.maxsolch.shop.ai.domain.JobStatus;
import com.maxsolch.shop.ai.domain.PauseReason;
import com.maxsolch.shop.ai.infra.AiBatchRepository;
import com.maxsolch.shop.ai.infra.AiJobRepository;
import com.maxsolch.shop.audit.app.AdminAuditService;
import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.platform.security.AdminAccess;
import com.maxsolch.shop.platform.web.CurrentActor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.util.EnumSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;

/**
 * What a person does with a batch: pause, continue, stop, «Повторить неудачные». The one who started a batch and an
 * admin with the finance right may; the others get {@code NOT_YOUR_JOB}. A paused batch does not go on by itself: only
 * «Продолжить», and only when no limit is used up and the AI is on.
 */
@Service
public class AiBatchControls {

    private static final Set<JobStatus> RETRYABLE = EnumSet.of(JobStatus.FAILED, JobStatus.BAD_ANSWER, JobStatus.EMPTY);

    private final AiBatchRepository batches;
    private final AiJobRepository jobs;
    private final AiJobReads jobReads;
    private final AiJobLifecycle lifecycle;
    private final AiBatchStarter starter;
    private final AiBatchReads reads;
    private final AiLimits limits;
    private final AiPolicy policy;
    private final AdminAccess access;
    private final CurrentActor actor;
    private final AdminAuditService audit;
    private final Clock clock;

    public AiBatchControls(AiBatchRepository batches, AiJobRepository jobs, AiJobReads jobReads, AiJobLifecycle lifecycle,
                           AiBatchStarter starter, AiBatchReads reads, AiLimits limits, AiPolicy policy,
                           AdminAccess access, CurrentActor actor, AdminAuditService audit, Clock clock) {
        this.batches = batches;
        this.jobs = jobs;
        this.jobReads = jobReads;
        this.lifecycle = lifecycle;
        this.starter = starter;
        this.reads = reads;
        this.limits = limits;
        this.policy = policy;
        this.access = access;
        this.actor = actor;
        this.audit = audit;
        this.clock = clock;
    }

    @Transactional
    public AiBatchDto pause(long id) {
        AiBatch b = mine(id);
        b.pause(PauseReason.MANUAL, clock.instant());
        audit.record("AI_BATCH_PAUSE", "AI_BATCH", String.valueOf(id), "ИИ: пакет на паузе");
        return dto(b);
    }

    @Transactional
    public AiBatchDto resume(long id) {
        AiBatch b = mine(id);
        if (!policy.killSwitchOn() || !policy.enabled() || !policy.featureOn(b.getFeature())) {
            throw new DomainException.Conflict(AiError.DISABLED);
        }
        limits.exhausted().ifPresent(e -> {
            throw new DomainException.Conflict(e);
        });
        b.resume(clock.instant());
        audit.record("AI_BATCH_RESUME", "AI_BATCH", String.valueOf(id), "ИИ: пакет продолжен");
        return dto(b);
    }

    /** Stops the batch: queued jobs end at once, running ones before their next model turn; what is ready stays. */
    @Transactional
    public AiBatchDto cancel(long id) {
        AiBatch b = mine(id);
        if (b.cancel(clock.instant())) {
            jobs.findByBatchIdOrderByIdAsc(id).stream().filter(j -> j.getStatus().active())
                    .forEach(j -> lifecycle.requestCancel(j.getId()));
            audit.record("AI_BATCH_CANCEL", "AI_BATCH", String.valueOf(id), "ИИ: пакет остановлен");
        }
        return dto(b);
    }

    /** A new batch for the jobs of this one that ended without a usable result and were not asked again. */
    public AiBatchDto retryFailed(long id, String idemKey) {
        AiBatch old = batches.findById(id).orElseThrow(() -> new DomainException.NotFound(AiError.BATCH_NOT_FOUND));
        checkOwner(old);
        List<AiJob> failed = jobs.findByBatchIdOrderByIdAsc(id).stream()
                .filter(j -> RETRYABLE.contains(j.getStatus()) && !jobs.existsByRetryOf(j.getId())).toList();
        List<AiBatchStarter.Item> items = failed.stream().map(this::again).filter(Objects::nonNull).toList();
        if (items.isEmpty()) {
            throw new DomainException.Conflict(AiError.BAD_STATE);
        }
        if (!policy.enabled() || !policy.featureOn(old.getFeature()) || !policy.batchesOn()) {
            throw new DomainException.Conflict(AiError.DISABLED);
        }
        limits.preflight(old.getFeature(), failed.get(0).getMode(), 1);
        long adminId = actor.userId();
        AiBatch b = starter.start(new AiBatchStarter.Plan(old.getFeature(), adminId, idemKey, id,
                failed.get(0).getPromptVersion(), items));
        return reads.read(b.getId(), access.canSeeFinance(adminId)).orElseThrow();
    }

    private AiBatchStarter.Item again(AiJob j) {
        return jobReads.source(j.getId()).map(AiJobReads.Source::prompt).filter(Objects::nonNull)
                .map(p -> new AiBatchStarter.Item(j.getSubjectType(), j.getSubjectId(), j.getSubjectVersion(), p,
                        j.getMode(), j.getEffort(), j.getResearchItems(), j.getId()))
                .orElse(null);
    }

    private AiBatch mine(long id) {
        AiBatch b = batches.lockById(id).orElseThrow(() -> new DomainException.NotFound(AiError.BATCH_NOT_FOUND));
        checkOwner(b);
        return b;
    }

    private void checkOwner(AiBatch b) {
        long adminId = actor.userId();
        if (b.getAdminId() != adminId && !access.canSeeFinance(adminId)) {
            throw new DomainException.Forbidden(AiError.NOT_YOUR_JOB);
        }
    }

    private AiBatchDto dto(AiBatch b) {
        return reads.dto(b, access.canSeeFinance(actor.userId()));
    }
}
