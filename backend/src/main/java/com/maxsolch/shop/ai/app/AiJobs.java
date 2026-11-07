package com.maxsolch.shop.ai.app;

import com.maxsolch.shop.ai.domain.AiError;
import com.maxsolch.shop.ai.domain.AiFeature;
import com.maxsolch.shop.ai.domain.AiJob;
import com.maxsolch.shop.ai.domain.AiMoney;
import com.maxsolch.shop.ai.domain.JobMode;
import com.maxsolch.shop.audit.app.AdminAuditService;
import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.platform.security.AdminAccess;
import com.maxsolch.shop.platform.web.CurrentActor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * The AI tasks as the admin sees them: start one for an object (a product, a translation, an invoice), look at it,
 * stop it, ask again more thoroughly, report what was done with the result. The task lives in the database
 * ({@link AiJobLifecycle}) and is executed by the worker; this class is only the rules of the front door:
 * who may start (the AI and the feature are on), what is refused at once (a limit, a second task for the same
 * object, a repeated key answers with the first task), and what each role sees ({@link AiJobDto}).
 * The admin is read from the request here, before any background thread exists.
 */
@Service
public class AiJobs {

    static final int MAX_PROMPT = 200_000;
    static final int MAX_ITEMS = 10;
    static final int MAX_KEY = 64;
    private static final Set<String> EFFORTS = Set.of("low", "medium", "high");

    /** What the screen sends: for which object, with which prompt (built the same way as for copying to ChatGPT). */
    public record CreateJob(AiFeature feature, String subjectType, String subjectId, String subjectVersion,
                            JobMode mode, String effort, int researchItems, String prompt, String promptVersion) {
    }

    /** Before the start: how long and (for the owner) how much. */
    public record EstimateRequest(AiFeature feature, JobMode mode, int items) {
    }

    /** The money fields are null for an admin without the finance right. */
    public record EstimateDto(int seconds, boolean fromHistory, Long p50Minor, Long p90Minor) {
    }

    private final AiJobLifecycle lifecycle;
    private final AiJobReads reads;
    private final AiOutcome outcome;
    private final AiLimits limits;
    private final AiPolicy policy;
    private final AiEstimate estimate;
    private final AiAgent agent;
    private final AdminAccess access;
    private final CurrentActor actor;
    private final AdminAuditService audit;

    public AiJobs(AiJobLifecycle lifecycle, AiJobReads reads, AiOutcome outcome, AiLimits limits, AiPolicy policy,
                  AiEstimate estimate, AiAgent agent, AdminAccess access, CurrentActor actor, AdminAuditService audit) {
        this.lifecycle = lifecycle;
        this.reads = reads;
        this.outcome = outcome;
        this.limits = limits;
        this.policy = policy;
        this.estimate = estimate;
        this.agent = agent;
        this.access = access;
        this.actor = actor;
        this.audit = audit;
    }

    public AiJobDto create(CreateJob req, String idemKey) {
        long adminId = actor.userId();
        boolean finance = access.canSeeFinance(adminId);
        validate(req, idemKey);
        if (idemKey != null) {
            var same = reads.byKey(adminId, idemKey, finance);
            if (same.isPresent()) {
                return same.get();
            }
        }
        if (!agent.configured()) {
            throw new DomainException.Unavailable(AiError.NOT_CONFIGURED);
        }
        if (!policy.enabled() || !policy.featureOn(req.feature())) {
            throw new DomainException.Conflict(AiError.DISABLED);
        }
        JobMode mode = req.mode() == null ? JobMode.NORMAL : req.mode();
        refuseIfActive(req.subjectType(), req.subjectId(), finance);
        limits.preflight(req.feature(), mode, Math.max(1, req.researchItems()));
        AiJob.Spec spec = new AiJob.Spec(req.feature(), adminId, req.subjectType(), req.subjectId(),
                req.subjectVersion(), mode, req.effort(), req.researchItems(), req.promptVersion(), idemKey, null);
        return start(spec, req.prompt(), finance);
    }

    public AiJobDto get(long id) {
        return reads.read(id, access.canSeeFinance(actor.userId()))
                .orElseThrow(() -> new DomainException.NotFound(AiError.JOB_NOT_FOUND));
    }

    public List<AiJobDto> active() {
        return reads.active(access.canSeeFinance(actor.userId()));
    }

    public AiJobDto cancel(long id) {
        lifecycle.requestCancel(id);
        audit.record("AI_JOB_CANCEL", "AI_JOB", String.valueOf(id), "ИИ: остановка задачи");
        return get(id);
    }

    /** One more attempt "more thoroughly" (high effort, twice the budget); one per job, unless the owner asks. */
    public AiJobDto retry(long id) {
        long adminId = actor.userId();
        boolean finance = access.canSeeFinance(adminId);
        AiJobReads.Source src = reads.source(id).orElseThrow(() -> new DomainException.NotFound(AiError.JOB_NOT_FOUND));
        AiJob old = src.job();
        if (old.getStatus().active()) {
            throw new DomainException.Conflict(AiError.BAD_STATE);
        }
        if (src.prompt() == null) {
            throw new DomainException.Conflict(AiError.PROMPT_GONE);
        }
        if (!finance && reads.retried(id)) {
            throw new DomainException.Conflict(AiError.RETRY_LIMIT);
        }
        if (!policy.enabled() || !policy.featureOn(old.getFeature())) {
            throw new DomainException.Conflict(AiError.DISABLED);
        }
        refuseIfActive(old.getSubjectType(), old.getSubjectId(), finance);
        limits.preflight(old.getFeature(), JobMode.THOROUGH, Math.max(1, old.getResearchItems()));
        AiJob.Spec spec = new AiJob.Spec(old.getFeature(), adminId, old.getSubjectType(), old.getSubjectId(),
                old.getSubjectVersion(), JobMode.THOROUGH, "high", old.getResearchItems(), old.getPromptVersion(),
                null, old.getId());
        return start(spec, src.prompt(), finance);
    }

    /** The review screen reports what the admin did with the result. */
    public AiJobDto outcome(long id, AiJob.Outcome body) {
        outcome.record(id, body);
        return get(id);
    }

    public EstimateDto estimate(EstimateRequest req) {
        if (req.feature() == null || req.feature() == AiFeature.SEARCH_TEST) {
            throw new DomainException.BadRequest(AiError.BAD_REQUEST, "feature");
        }
        AiEstimate.Estimate e = estimate.of(req.feature(), req.mode() == null ? JobMode.NORMAL : req.mode(),
                Math.max(1, req.items()));
        if (!access.canSeeFinance(actor.userId())) {
            return new EstimateDto(e.seconds(), e.fromHistory(), null, null);
        }
        int rate = policy.rateMilli();
        return new EstimateDto(e.seconds(), e.fromHistory(), AiMoney.costMinor(e.p50MicroUsd(), rate),
                AiMoney.costMinor(e.p90MicroUsd(), rate));
    }

    private AiJobDto start(AiJob.Spec spec, String prompt, boolean finance) {
        AiJob job;
        try {
            job = lifecycle.insert(spec, prompt);
        } catch (DataIntegrityViolationException e) {
            // two requests raced past the checks: the database decided (one active job per object, one key per admin)
            if (spec.idemKey() != null) {
                var same = reads.byKey(spec.adminId(), spec.idemKey(), finance);
                if (same.isPresent()) {
                    return same.get();
                }
            }
            refuseIfActive(spec.subjectType(), spec.subjectId(), finance);
            throw e;
        }
        audit.record("AI_JOB_START", spec.subjectType(), spec.subjectId(),
                "ИИ: " + spec.feature() + (spec.retryOf() == null ? "" : ", повтор задачи " + spec.retryOf()));
        return get(job.getId());
    }

    private void refuseIfActive(String subjectType, String subjectId, boolean finance) {
        reads.activeFor(subjectType, subjectId, finance).ifPresent(current -> {
            throw new DomainException.Conflict(AiError.JOB_ACTIVE).withDetails(Map.of("job", current));
        });
    }

    static void validate(CreateJob req, String idemKey) {
        if (req == null || req.feature() == null || req.feature() == AiFeature.SEARCH_TEST) {
            throw new DomainException.BadRequest(AiError.BAD_REQUEST, "feature");
        }
        if (blank(req.subjectType()) || req.subjectType().length() > 24 || blank(req.subjectId())
                || req.subjectId().length() > 64) {
            throw new DomainException.BadRequest(AiError.BAD_REQUEST, "subject");
        }
        if (blank(req.prompt()) || req.prompt().length() > MAX_PROMPT) {
            throw new DomainException.BadRequest(AiError.BAD_REQUEST, "prompt");
        }
        if (!EFFORTS.contains(req.effort())) {
            throw new DomainException.BadRequest(AiError.BAD_REQUEST, "effort");
        }
        if (req.researchItems() < 0 || req.researchItems() > MAX_ITEMS) {
            throw new DomainException.BadRequest(AiError.BAD_REQUEST, "researchItems");
        }
        if (idemKey != null && (idemKey.isBlank() || idemKey.length() > MAX_KEY)) {
            throw new DomainException.BadRequest(AiError.BAD_REQUEST, "Idempotency-Key");
        }
    }

    private static boolean blank(String s) {
        return s == null || s.isBlank();
    }
}
