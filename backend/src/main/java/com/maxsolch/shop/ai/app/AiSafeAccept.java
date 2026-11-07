package com.maxsolch.shop.ai.app;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.maxsolch.shop.ai.domain.AiApplyLog;
import com.maxsolch.shop.ai.domain.AiError;
import com.maxsolch.shop.ai.domain.AiJob;
import com.maxsolch.shop.ai.domain.ApplyDiff;
import com.maxsolch.shop.ai.domain.FieldChange;
import com.maxsolch.shop.ai.domain.JobStatus;
import com.maxsolch.shop.ai.domain.SubjectFields;
import com.maxsolch.shop.ai.infra.AiApplyLogRepository;
import com.maxsolch.shop.ai.infra.AiJobRepository;
import com.maxsolch.shop.audit.app.AdminAuditService;
import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.platform.security.AdminAccess;
import com.maxsolch.shop.platform.web.CurrentActor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Map;

/**
 * «Принять безопасное»: the screen applies a ready result field by field (it parses the answer and owns the card
 * form), and wraps each application in {@link #begin} and {@link #finish}. The server keeps the numbers honest:
 * {@code begin} takes the values of the object before, {@code finish} compares them with the values after and checks
 * the promise — only characteristics and the description, only empty fields filled, nothing replaced. A broken promise
 * is given back at once (the object is back as it was) and reported in {@code notSafe}; a kept one stays undoable for
 * 24 hours ({@link AiApplyUndo}). Only a result of a job that searched the web is eligible.
 */
@Service
public class AiSafeAccept {

    private static final TypeReference<Map<String, String>> SNAPSHOT = new TypeReference<>() {
    };

    /** @param id the application to finish (or undo) */
    public record Begun(long id) {
    }

    /**
     * @param changed fields the application changed; @param notSafe fields that broke the promise (then everything was
     *                given back and {@code undoUntil} is null); @param undoUntil end of the 24 hours of the undo
     */
    public record Applied(long id, long jobId, String subjectId, List<String> changed, List<String> notSafe,
                          Instant undoUntil) {
    }

    private final AiJobRepository jobs;
    private final AiApplyLogRepository logs;
    private final AiApplyUndo undo;
    private final AiSubjects subjects;
    private final ObjectMapper json;
    private final AdminAccess access;
    private final CurrentActor actor;
    private final AdminAuditService audit;
    private final Clock clock;

    public AiSafeAccept(AiJobRepository jobs, AiApplyLogRepository logs, AiApplyUndo undo, AiSubjects subjects,
                        ObjectMapper json, AdminAccess access, CurrentActor actor, AdminAuditService audit, Clock clock) {
        this.jobs = jobs;
        this.logs = logs;
        this.undo = undo;
        this.subjects = subjects;
        this.json = json;
        this.access = access;
        this.actor = actor;
        this.audit = audit;
        this.clock = clock;
    }

    /** Before the screen applies the result of a job: the values of the object as they are now. */
    @Transactional
    public Begun begin(long jobId) {
        AiJob job = jobs.findById(jobId).orElseThrow(() -> new DomainException.NotFound(AiError.JOB_NOT_FOUND));
        long adminId = actor.userId();
        if (job.getAdminId() != adminId && !access.canSeeFinance(adminId)) {
            throw new DomainException.Forbidden(AiError.NOT_YOUR_JOB);
        }
        boolean eligible = job.getBatchId() != null && job.getStatus() == JobStatus.DONE && job.getOutcome() == null
                && job.getSearches() > 0;
        boolean applied = logs.findByJobIdAndKindOrderByIdDesc(jobId, AiApplyLog.Kind.SAFE).stream()
                .anyMatch(l -> l.finished() && l.getUndoneAt() == null);
        if (!eligible || applied) {
            throw new DomainException.Conflict(AiError.NOT_SAFE);
        }
        Map<String, String> before = subjects.of(job.getSubjectType()).snapshot(job.getSubjectId());
        AiApplyLog log = logs.save(AiApplyLog.begin(job, adminId, AiApplyLog.Kind.SAFE, write(before), clock.instant()));
        return new Begun(log.getId());
    }

    /** After the screen saved the card: compare, check the promise, keep or give back. Repeating the call answers the same. */
    @Transactional
    public Applied finish(long applyId) {
        AiApplyLog log = logs.lockById(applyId).orElseThrow(() -> new DomainException.NotFound(AiError.APPLY_NOT_FOUND));
        long adminId = actor.userId();
        if (log.getAdminId() != adminId && !access.canSeeFinance(adminId)) {
            throw new DomainException.Forbidden(AiError.NOT_YOUR_JOB);
        }
        if (log.finished()) {
            return answer(log, List.of());
        }
        SubjectFields port = subjects.of(log.getSubjectType());
        Map<String, FieldChange> changes = ApplyDiff.diff(read(log.getSnapshot()), port.snapshot(log.getSubjectId()));
        Map<String, FieldChange> bad = ApplyDiff.violations(changes);
        log.finish(write(changes), clock.instant());
        if (!bad.isEmpty()) {
            undo.revert(log);
            audit.record("AI_APPLY_NOT_SAFE", log.getSubjectType(), log.getSubjectId(),
                    "ИИ: применение не было безопасным, возвращено: " + String.join(", ", bad.keySet()));
            return answer(log, undo.keys(bad));
        }
        audit.record("AI_APPLY_SAFE", log.getSubjectType(), log.getSubjectId(),
                "ИИ: принято безопасное, полей " + changes.size());
        return answer(log, List.of());
    }

    private Applied answer(AiApplyLog log, List<String> notSafe) {
        boolean open = log.undoable(clock.instant());
        return new Applied(log.getId(), log.getJobId(), log.getSubjectId(), undo.keys(undo.readChanges(log.getChanges())),
                notSafe, open ? log.undoUntil() : null);
    }

    private String write(Object value) {
        try {
            return json.writeValueAsString(value);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException(e);
        }
    }

    private Map<String, String> read(String raw) {
        try {
            return json.readValue(raw, SNAPSHOT);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("ai_apply_log.snapshot is not readable", e);
        }
    }
}
