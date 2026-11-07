package com.maxsolch.shop.ai.app;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.maxsolch.shop.ai.domain.AiApplyLog;
import com.maxsolch.shop.ai.domain.AiError;
import com.maxsolch.shop.ai.domain.ApplyDiff;
import com.maxsolch.shop.ai.domain.FieldChange;
import com.maxsolch.shop.ai.domain.SubjectFields;
import com.maxsolch.shop.ai.infra.AiApplyLogRepository;
import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.platform.security.AdminAccess;
import com.maxsolch.shop.platform.web.CurrentActor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.util.Map;
import java.util.function.Supplier;

/**
 * The steps of an application that come after the card is saved (the photos of the answer, «Сохранить цену и
 * выложить»): the module that does the step runs it through {@link #within} with the id of the application, and what
 * the step changed is added to that application's log — so «Отменить применение» gives it back as well. Done on the
 * server in the step's own transaction, not by the screen: a step whose record failed has not happened either.
 *
 * <p>Lock order is the one of the undo — the log row first, then the object — so a step and an undo running at the same
 * time wait for each other instead of deadlocking. A step of an application that was undone (or whose 24 hours are
 * over) is refused with {@code AI_UNDO_CLOSED}: a photo arriving after «Отменить применение» must not stay.
 */
@Service
public class AiApplySteps {

    private final AiApplyLogRepository logs;
    private final AiSubjects subjects;
    private final AiApplyUndo undo;
    private final ObjectMapper json;
    private final AdminAccess access;
    private final CurrentActor actor;
    private final Clock clock;

    public AiApplySteps(AiApplyLogRepository logs, AiSubjects subjects, AiApplyUndo undo, ObjectMapper json,
                        AdminAccess access, CurrentActor actor, Clock clock) {
        this.logs = logs;
        this.subjects = subjects;
        this.undo = undo;
        this.json = json;
        this.access = access;
        this.actor = actor;
        this.clock = clock;
    }

    /**
     * Runs {@code step} on the object; with an {@code applyId}, inside one transaction with the log row locked, and
     * records what it changed. Without one the step simply runs. A step of a log not finished yet needs no record:
     * the finish compares the whole object anyway.
     */
    @Transactional
    public <T> T within(Long applyId, String subjectType, String subjectId, Supplier<T> step) {
        if (applyId == null) {
            return step.get();
        }
        AiApplyLog log = logs.lockById(applyId).orElseThrow(() -> new DomainException.NotFound(AiError.APPLY_NOT_FOUND));
        check(log, subjectType, subjectId);
        if (!log.finished()) {
            return step.get();
        }
        if (!log.undoable(clock.instant())) {
            throw new DomainException.Conflict(AiError.UNDO_CLOSED);
        }
        SubjectFields port = subjects.of(subjectType);
        Map<String, String> before = port.applySnapshot(log.getSubjectId());
        T out = step.get();
        Map<String, FieldChange> changed = ApplyDiff.diff(before, port.applySnapshot(log.getSubjectId()));
        if (!changed.isEmpty()) {
            log.record(write(ApplyDiff.merge(undo.readChanges(log.getChanges()), changed)));
        }
        return out;
    }

    private void check(AiApplyLog log, String subjectType, String subjectId) {
        long adminId = actor.userId();
        if (log.getAdminId() != adminId && !access.canSeeFinance(adminId)) {
            throw new DomainException.Forbidden(AiError.NOT_YOUR_JOB);
        }
        if (!log.getSubjectType().equals(subjectType) || !log.getSubjectId().equalsIgnoreCase(subjectId)) {
            throw new DomainException.BadRequest(AiError.BAD_REQUEST, "applyId");
        }
    }

    private String write(Object value) {
        try {
            return json.writeValueAsString(value);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException(e);
        }
    }
}
