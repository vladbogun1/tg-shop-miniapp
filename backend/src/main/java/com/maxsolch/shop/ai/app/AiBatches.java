package com.maxsolch.shop.ai.app;

import com.maxsolch.shop.ai.domain.AiBatch;
import com.maxsolch.shop.ai.domain.AiError;
import com.maxsolch.shop.ai.domain.AiFeature;
import com.maxsolch.shop.ai.domain.JobMode;
import com.maxsolch.shop.ai.infra.AiBatchRepository;
import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.platform.security.AdminAccess;
import com.maxsolch.shop.platform.web.CurrentActor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;

import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

/**
 * The front door of a batch: «Заполнить с ИИ (N)» for several objects at once. The rules are those of one task
 * ({@link AiJobs}: the AI and the feature are on, a limit is not used up, an object has no active task) plus the
 * batch's own: «Пакеты» is on, at most {@code ai.batchSize} (30) objects, each object once. The jobs are queued in one
 * transaction ({@link AiBatchStarter}); the same Idempotency-Key returns the first batch. What a batch does while it
 * runs is {@link AiBatchRunner}; pause, continue, stop and «Повторить неудачные» are {@link AiBatchControls}.
 */
@Service
public class AiBatches {

    static final int MAX_KEY = 64;
    private static final Set<String> EFFORTS = Set.of("low", "medium", "high");

    /** One object of the batch: its prompt is built by the screen, the same text as for one task. */
    public record Item(String subjectType, String subjectId, String subjectVersion, String prompt) {
    }

    /** What the screen sends: the feature, how thorough, and the objects. */
    public record Create(AiFeature feature, JobMode mode, String effort, int researchItems, String promptVersion,
                         List<Item> items) {
    }

    /** Before the start: the feature, the mode and how many objects. */
    public record EstimateRequest(AiFeature feature, JobMode mode, int count) {
    }

    private final AiBatchStarter starter;
    private final AiBatchReads reads;
    private final AiJobReads jobReads;
    private final AiBatchRepository batches;
    private final AiBatchEstimate estimate;
    private final AiLimits limits;
    private final AiPolicy policy;
    private final AiAgent agent;
    private final AdminAccess access;
    private final CurrentActor actor;

    public AiBatches(AiBatchStarter starter, AiBatchReads reads, AiJobReads jobReads, AiBatchRepository batches,
                     AiBatchEstimate estimate, AiLimits limits, AiPolicy policy, AiAgent agent, AdminAccess access,
                     CurrentActor actor) {
        this.starter = starter;
        this.reads = reads;
        this.jobReads = jobReads;
        this.batches = batches;
        this.estimate = estimate;
        this.limits = limits;
        this.policy = policy;
        this.agent = agent;
        this.access = access;
        this.actor = actor;
    }

    public AiBatchDto create(Create req, String idemKey) {
        long adminId = actor.userId();
        boolean finance = access.canSeeFinance(adminId);
        validate(req, idemKey);
        Optional<AiBatchDto> same = byKey(adminId, idemKey, finance);
        if (same.isPresent()) {
            return same.get();
        }
        requireOn(req.feature());
        refuseActive(req.items(), finance);
        JobMode mode = req.mode() == null ? JobMode.NORMAL : req.mode();
        limits.preflight(req.feature(), mode, 1);
        List<AiBatchStarter.Item> items = req.items().stream().map(i -> new AiBatchStarter.Item(i.subjectType(),
                i.subjectId(), i.subjectVersion(), i.prompt(), mode, req.effort(), req.researchItems(), null)).toList();
        try {
            AiBatch b = starter.start(new AiBatchStarter.Plan(req.feature(), adminId, idemKey, null,
                    req.promptVersion(), items));
            return reads.read(b.getId(), finance).orElseThrow();
        } catch (DataIntegrityViolationException e) {
            // two requests raced past the checks: the database decided (a repeated key, a second active job for an object)
            Optional<AiBatchDto> first = byKey(adminId, idemKey, finance);
            if (first.isPresent()) {
                return first.get();
            }
            refuseActive(req.items(), finance);
            throw e;
        }
    }

    public AiBatchDto get(long id) {
        return reads.read(id, access.canSeeFinance(actor.userId()))
                .orElseThrow(() -> new DomainException.NotFound(AiError.BATCH_NOT_FOUND));
    }

    /** Running and paused batches of everybody, and the finished ones of this admin with something left to do. */
    public List<AiBatchDto> active() {
        long adminId = actor.userId();
        return reads.active(adminId, access.canSeeFinance(adminId));
    }

    public AiBatchEstimate.Dto estimate(EstimateRequest req) {
        if (req == null || req.feature() == null || req.feature() == AiFeature.SEARCH_TEST) {
            throw new DomainException.BadRequest(AiError.BAD_REQUEST, "feature");
        }
        checkSize(req.count());
        return estimate.of(req.feature(), req.mode() == null ? JobMode.NORMAL : req.mode(), req.count(),
                access.canSeeFinance(actor.userId()));
    }

    private Optional<AiBatchDto> byKey(long adminId, String idemKey, boolean finance) {
        return idemKey == null ? Optional.empty()
                : batches.findByAdminIdAndIdemKey(adminId, idemKey).flatMap(b -> reads.read(b.getId(), finance));
    }

    private void requireOn(AiFeature feature) {
        if (!agent.configured()) {
            throw new DomainException.Unavailable(AiError.NOT_CONFIGURED);
        }
        if (!policy.enabled() || !policy.featureOn(feature)) {
            throw new DomainException.Conflict(AiError.DISABLED);
        }
        if (!policy.batchesOn()) {
            throw new DomainException.Conflict(AiError.BATCHES_OFF);
        }
    }

    private void refuseActive(List<Item> items, boolean finance) {
        List<String> busy = items.stream()
                .filter(i -> jobReads.activeFor(i.subjectType(), i.subjectId(), finance).isPresent())
                .map(Item::subjectId).toList();
        if (!busy.isEmpty()) {
            throw new DomainException.Conflict(AiError.JOB_ACTIVE).withDetails(Map.of("subjects", busy));
        }
    }

    private void checkSize(int n) {
        if (n < 1 || n > policy.batchMax()) {
            throw new DomainException.BadRequest(AiError.BATCH_SIZE, policy.batchMax());
        }
    }

    private void validate(Create req, String idemKey) {
        if (req == null || req.feature() == null || req.feature() == AiFeature.SEARCH_TEST || req.items() == null) {
            throw new DomainException.BadRequest(AiError.BAD_REQUEST, "feature");
        }
        checkSize(req.items().size());
        if (!EFFORTS.contains(req.effort())) {
            throw new DomainException.BadRequest(AiError.BAD_REQUEST, "effort");
        }
        if (req.researchItems() < 0 || req.researchItems() > AiJobs.MAX_ITEMS) {
            throw new DomainException.BadRequest(AiError.BAD_REQUEST, "researchItems");
        }
        if (idemKey != null && (idemKey.isBlank() || idemKey.length() > MAX_KEY)) {
            throw new DomainException.BadRequest(AiError.BAD_REQUEST, "Idempotency-Key");
        }
        Set<String> seen = new HashSet<>();
        for (Item i : req.items()) {
            boolean bad = i == null || blank(i.subjectType()) || i.subjectType().length() > 24 || blank(i.subjectId())
                    || i.subjectId().length() > 64 || blank(i.prompt()) || i.prompt().length() > AiJobs.MAX_PROMPT;
            if (bad || !seen.add(i.subjectType() + ":" + i.subjectId())) {
                throw new DomainException.BadRequest(AiError.BAD_REQUEST, "items");
            }
        }
    }

    private static boolean blank(String s) {
        return s == null || s.isBlank();
    }
}
