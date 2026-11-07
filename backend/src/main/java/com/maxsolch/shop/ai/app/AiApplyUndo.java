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
 * so its row is back in the feed. Characteristics the application removed come back too, and so does what the
 * application wrote beside the fields (see {@link SubjectFields#applySnapshot}: photos, translations, card status,
 * storefront). The answer names the keys given back and the ones left because somebody changed them by hand.
 */
@Service
public class AiApplyUndo {

    private static final TypeReference<Map<String, FieldChange>> CHANGES = new TypeReference<>() {
    };

    /**
     * @param reverted fields given back; @param skipped fields left because they were edited since;
     * @param revertedFields / @param skippedFields their keys ({@code description}, {@code spec:dpi},
     *        {@code photo:<key>}, {@code tr:uk:title}, {@code status}, {@code active}, …), distinct over a batch
     */
    public record Result(int applications, int reverted, int skipped, List<String> revertedFields,
                         List<String> skippedFields) {
    }

    /**
     * The application of a job that can still be undone; id and undoUntil null when there is none. {@code changed} —
     * the keys it wrote (with the later steps: photos, publishing), for «what comes back» on the screen.
     */
    public record Live(Long id, Instant undoUntil, List<String> changed) {
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
                "ИИ: отмена применения, возвращено полей " + r.reverted() + ", оставлено (правили руками) " + r.skipped()
                        + (r.skippedFields().isEmpty() ? "" : ": " + String.join(", ", r.skippedFields())));
        return r;
    }

    /** Undo every application of the batch that can still be undone. */
    @Transactional
    public Result undoBatch(long batchId) {
        AiBatch b = batches.findById(batchId).orElseThrow(() -> new DomainException.NotFound(AiError.BATCH_NOT_FOUND));
        checkOwner(b.getAdminId());
        Result sum = new Result(0, 0, 0, List.of(), List.of());
        for (AiApplyLog l : logs.findByBatchIdOrderByIdAsc(batchId)) {
            AiApplyLog locked = logs.lockById(l.getId()).orElseThrow();
            if (locked.undoable(clock.instant())) {
                sum = plus(sum, revert(locked));
            }
        }
        if (sum.applications() == 0) {
            throw new DomainException.Conflict(AiError.UNDO_CLOSED);
        }
        audit.record("AI_APPLY_UNDO", "AI_BATCH", String.valueOf(batchId), "ИИ: отмена применений пакета, карточек "
                + sum.applications() + ", полей " + sum.reverted() + ", оставлено " + sum.skipped());
        return sum;
    }

    /** The live application of a job, for «Отменить применение» on its review screen. */
    @Transactional(readOnly = true)
    public Live live(long jobId) {
        Instant now = clock.instant();
        AiApplyLog live = logs.findByJobIdOrderByIdDesc(jobId).stream().filter(l -> l.undoable(now)).findFirst().orElse(null);
        if (live == null) {
            return new Live(null, null, List.of());
        }
        checkOwner(live.getAdminId());
        return new Live(live.getId(), live.undoUntil(), keys(readChanges(live.getChanges())));
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
        return new Result(1, done.reverted().size(), done.skipped().size(), List.copyOf(done.reverted()),
                List.copyOf(done.skipped()));
    }

    private static Result plus(Result a, Result b) {
        return new Result(a.applications() + b.applications(), a.reverted() + b.reverted(), a.skipped() + b.skipped(),
                distinct(a.revertedFields(), b.revertedFields()), distinct(a.skippedFields(), b.skippedFields()));
    }

    private static List<String> distinct(List<String> a, List<String> b) {
        return java.util.stream.Stream.concat(a.stream(), b.stream()).distinct().toList();
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
