package com.maxsolch.shop.ai.app;

import com.maxsolch.shop.ai.domain.AiError;
import com.maxsolch.shop.ai.domain.AiFeature;
import com.maxsolch.shop.ai.domain.AiJob;
import com.maxsolch.shop.ai.domain.AiJobBody;
import com.maxsolch.shop.ai.domain.JobMode;
import com.maxsolch.shop.ai.domain.ManualReason;
import com.maxsolch.shop.ai.infra.AiApplyLogRepository;
import com.maxsolch.shop.ai.infra.AiJobBodyRepository;
import com.maxsolch.shop.ai.infra.AiJobRepository;
import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.platform.security.AdminAccess;
import com.maxsolch.shop.platform.web.CurrentActor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Optional;

/**
 * The manual way through ChatGPT as a task: an answer the admin pasted becomes a job of {@code ai_jobs} (path MANUAL,
 * {@code pasted}) with the prompt and the answer in {@code ai_job_bodies}, finished at once and waiting for the same
 * review as a result of the AI: «Принять», «Принять безопасное» with the 24-hour undo, the outcome in the metrics. No
 * model, no money, no reserve: it works with the AI switched off, without a key and with a limit used up. The reason of
 * the manual way (off, limit, failure, choice) is decided by the server, as for a mark ({@link AiManualMarks#reason}).
 * A newer answer replaces the one nobody has decided on yet; a decided one stays as it is.
 */
@Service
public class AiPastedJobs {

    static final int MAX_VERSION = 64;
    static final int MAX_PROMPT_VERSION = 32;

    /** One object and the answer for it; {@code prompt} is the text it answers (a part of several objects in a batch). */
    public record Paste(AiFeature feature, String subjectType, String subjectId, String subjectVersion,
                        String promptVersion, String prompt, String answer) {
    }

    private final AiJobRepository jobs;
    private final AiJobBodyRepository bodies;
    private final AiApplyLogRepository applies;
    private final AiManualMarks marks;
    private final AiSubjectChanges changes;
    private final AiJobReads reads;
    private final AdminAccess access;
    private final CurrentActor actor;
    private final Clock clock;

    public AiPastedJobs(AiJobRepository jobs, AiJobBodyRepository bodies, AiApplyLogRepository applies,
                        AiManualMarks marks, AiSubjectChanges changes, AiJobReads reads, AdminAccess access,
                        CurrentActor actor, Clock clock) {
        this.jobs = jobs;
        this.bodies = bodies;
        this.applies = applies;
        this.marks = marks;
        this.changes = changes;
        this.reads = reads;
        this.access = access;
        this.actor = actor;
        this.clock = clock;
    }

    /**
     * One object outside a batch («Через ChatGPT вручную» of a card). The snapshot of the object is taken now: the
     * review protects what somebody changes after the answer was pasted.
     */
    @Transactional
    public AiJobDto single(Paste p) {
        validate(p);
        long adminId = actor.userId();
        Instant now = clock.instant();
        List<AiJob> pending = jobs.pendingPasted(adminId, p.subjectType(), p.subjectId());
        AiJob job = pending.isEmpty() ? null : replace(pending.get(0), p, now).orElse(null);
        if (job == null) {
            job = create(p, adminId, null, changes.snapshot(p.subjectType(), p.subjectId()), now);
        }
        pending.stream().skip(1).forEach(this::dropPending);
        long id = job.getId();
        return reads.read(id, adminId, access.canSeeFinance(adminId)).orElseThrow();
    }

    /** In a manual batch: the pending job of the object gets the newer answer, otherwise a new job; a decided one stays. */
    Optional<AiJob> inBatch(Paste p, long adminId, long batchId, String snapshot, Instant now) {
        Optional<AiJob> existing = jobs.findFirstByBatchIdAndSubjectIdOrderByIdDesc(batchId, p.subjectId());
        if (existing.isPresent()) {
            return replace(existing.get(), p, now);
        }
        return Optional.of(create(p, adminId, batchId, snapshot, now));
    }

    /**
     * A pending pasted job goes away (its part was pasted again without it, its batch was discarded) unless something
     * was already applied from it. Returns true if removed.
     */
    boolean dropPending(AiJob j) {
        if (!j.isPasted() || j.getOutcome() != null || applies.existsByJobId(j.getId())) {
            return false;
        }
        bodies.findById(j.getId()).ifPresent(bodies::delete);
        jobs.delete(j);
        return true;
    }

    private Optional<AiJob> replace(AiJob job, Paste p, Instant now) {
        if (!job.repaste(p.subjectVersion(), now)) {
            return Optional.empty();
        }
        Optional<AiJobBody> body = bodies.findById(job.getId());
        if (body.isPresent()) {
            body.get().repasted(p.prompt(), p.answer());
        } else {
            bodies.save(answered(job.getId(), p, null, now));
        }
        return Optional.of(job);
    }

    private AiJob create(Paste p, long adminId, Long batchId, String snapshot, Instant now) {
        ManualReason reason = marks.reason(p.feature(), adminId, p.subjectId(), now);
        AiJob.Spec spec = new AiJob.Spec(p.feature(), adminId, p.subjectType(), p.subjectId(), p.subjectVersion(),
                JobMode.NORMAL, "none", 0, p.promptVersion(), null, null, batchId);
        AiJob job = jobs.save(AiJob.pasted(spec, reason, now));
        bodies.save(answered(job.getId(), p, snapshot, now));
        return job;
    }

    private static AiJobBody answered(long jobId, Paste p, String snapshot, Instant now) {
        AiJobBody b = AiJobBody.of(jobId, p.prompt(), snapshot, now);
        b.answered(p.answer());
        return b;
    }

    static void validate(Paste p) {
        if (p == null || p.feature() == null || p.feature() == AiFeature.SEARCH_TEST) {
            throw new DomainException.BadRequest(AiError.BAD_REQUEST, "feature");
        }
        if (blank(p.subjectType()) || p.subjectType().length() > 24 || blank(p.subjectId()) || p.subjectId().length() > 64) {
            throw new DomainException.BadRequest(AiError.BAD_REQUEST, "subjectId");
        }
        if (blank(p.subjectVersion()) || p.subjectVersion().length() > MAX_VERSION) {
            throw new DomainException.BadRequest(AiError.BAD_REQUEST, "subjectVersion");
        }
        if (p.promptVersion() != null && p.promptVersion().length() > MAX_PROMPT_VERSION) {
            throw new DomainException.BadRequest(AiError.BAD_REQUEST, "promptVersion");
        }
        if (blank(p.prompt()) || p.prompt().length() > AiJobs.MAX_PROMPT) {
            throw new DomainException.BadRequest(AiError.BAD_REQUEST, "prompt");
        }
        if (blank(p.answer()) || p.answer().length() > AiJobs.MAX_PROMPT) {
            throw new DomainException.BadRequest(AiError.BAD_REQUEST, "answer");
        }
    }

    private static boolean blank(String s) {
        return s == null || s.isBlank();
    }
}
