package com.maxsolch.shop.ai.app;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.maxsolch.shop.ai.domain.AiApplyLog;
import com.maxsolch.shop.ai.domain.AiBatch;
import com.maxsolch.shop.ai.domain.AiError;
import com.maxsolch.shop.ai.domain.AiJob;
import com.maxsolch.shop.ai.domain.FieldChange;
import com.maxsolch.shop.ai.domain.SubjectFields;
import com.maxsolch.shop.ai.infra.AiApplyLogRepository;
import com.maxsolch.shop.ai.infra.AiBatchRepository;
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
 * «Отменить применение» (24 hours): gives the fields of an application back, one object or the whole batch. A field is
 * given back only while it still holds what the application wrote; a field somebody has edited by hand since is left
 * alone and counted as skipped. The object is changed through {@link SubjectFields} (the catalog implements it) under
 * its own lock, and the log row is locked here, so a second click undoes nothing twice. Both kinds are undone (the
 * safe acceptance and an ordinary application); after an undo the job waits for a review again ({@link AiJob#reopen}),
 * so its row is back in the feed. Characteristics the application removed come back too.
 */
@Service
public class AiApplyUndo {

    private static final TypeReference<Map<String, FieldChange>> CHANGES = new TypeReference<>() {
    };

    /** @param reverted fields given back; @param skipped fields left because they were edited since */
    public record Result(int applications, int reverted, int skipped) {
    }

    /** The application of a job that can still be undone; both null when there is none. */
    public record Live(Long id, Instant undoUntil) {
    }

    private final AiApplyLogRepository logs;
    private final AiBatchRepository batches;
    private final AiJobRepository jobs;
    private final AiSubjects subjects;
    private final ObjectMapper json;
    private final AdminAccess access;
    private final CurrentActor actor;
    private final AdminAuditService audit;
    private final Clock clock;

    public AiApplyUndo(AiApplyLogRepository logs, AiBatchRepository batches, AiJobRepository jobs, AiSubjects subjects,
                       ObjectMapper json, AdminAccess access, CurrentActor actor, AdminAuditService audit, Clock clock) {
        this.logs = logs;
        this.batches = batches;
        this.jobs = jobs;
        this.subjects = subjects;
        this.json = json;
        this.access = access;
        this.actor = actor;
        this.audit = audit;
        this.clock = clock;
    }

    /** Undo one application. UNDO_CLOSED when the 24 hours are over or it was undone already. */
    @Transactional
    public Result undo(long applyId) {
        AiApplyLog log = logs.lockById(applyId).orElseThrow(() -> new DomainException.NotFound(AiError.APPLY_NOT_FOUND));
        checkOwner(log.getAdminId());
        if (!log.undoable(clock.instant())) {
            throw new DomainException.Conflict(AiError.UNDO_CLOSED);
        }
        Result r = revert(log);
        audit.record("AI_APPLY_UNDO", log.getSubjectType(), log.getSubjectId(),
                "ИИ: отмена применения, возвращено полей " + r.reverted() + ", оставлено (правили руками) " + r.skipped());
        return r;
    }

    /** Undo every application of the batch that can still be undone. */
    @Transactional
    public Result undoBatch(long batchId) {
        AiBatch b = batches.findById(batchId).orElseThrow(() -> new DomainException.NotFound(AiError.BATCH_NOT_FOUND));
        checkOwner(b.getAdminId());
        int apps = 0;
        int reverted = 0;
        int skipped = 0;
        for (AiApplyLog l : logs.findByBatchIdOrderByIdAsc(batchId)) {
            AiApplyLog locked = logs.lockById(l.getId()).orElseThrow();
            if (locked.undoable(clock.instant())) {
                Result r = revert(locked);
                apps++;
                reverted += r.reverted();
                skipped += r.skipped();
            }
        }
        if (apps == 0) {
            throw new DomainException.Conflict(AiError.UNDO_CLOSED);
        }
        audit.record("AI_APPLY_UNDO", "AI_BATCH", String.valueOf(batchId),
                "ИИ: отмена применений пакета, карточек " + apps + ", полей " + reverted + ", оставлено " + skipped);
        return new Result(apps, reverted, skipped);
    }

    /** The live application of a job, for «Отменить применение» on its review screen. */
    @Transactional(readOnly = true)
    public Live live(long jobId) {
        Instant now = clock.instant();
        AiApplyLog live = logs.findByJobIdOrderByIdDesc(jobId).stream().filter(l -> l.undoable(now)).findFirst().orElse(null);
        if (live == null) {
            return new Live(null, null);
        }
        checkOwner(live.getAdminId());
        return new Live(live.getId(), live.undoUntil());
    }

    /**
     * Gives back what the log says, closes it and opens the job for a review again (also used when a «safe»
     * application turns out not to be safe: then nothing of it stays applied either).
     */
    Result revert(AiApplyLog log) {
        Map<String, FieldChange> changes = readChanges(log.getChanges());
        SubjectFields.Reverted done = subjects.of(log.getSubjectType()).revertUnchanged(log.getSubjectId(), changes);
        log.undone(done.reverted().size(), done.skipped().size(), clock.instant());
        jobs.findById(log.getJobId()).ifPresent(AiJob::reopen);
        return new Result(1, done.reverted().size(), done.skipped().size());
    }

    Map<String, FieldChange> readChanges(String raw) {
        try {
            return raw == null ? Map.of() : json.readValue(raw, CHANGES);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("ai_apply_log.changes is not readable", e);
        }
    }

    List<String> keys(Map<String, FieldChange> changes) {
        return List.copyOf(changes.keySet());
    }

    private void checkOwner(long ownerId) {
        long adminId = actor.userId();
        if (ownerId != adminId && !access.canSeeFinance(adminId)) {
            throw new DomainException.Forbidden(AiError.NOT_YOUR_JOB);
        }
    }
}
