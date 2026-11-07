package com.maxsolch.shop.ai.app;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.maxsolch.shop.ai.domain.AiBatch;
import com.maxsolch.shop.ai.domain.AiError;
import com.maxsolch.shop.ai.domain.AiFeature;
import com.maxsolch.shop.ai.domain.AiJob;
import com.maxsolch.shop.ai.domain.BatchStatus;
import com.maxsolch.shop.ai.domain.JobPath;
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
import java.util.EnumSet;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * The manual batch of cards on the server (the manual way through ChatGPT, part by part): the objects and their
 * snapshot at the start, the screen's draft (so it can be continued on another device) and a job per pasted answer
 * ({@link AiPastedJobs}): the batch has the same review feed, «Принять безопасное» and undo as a batch of the AI, and
 * shows in «ИИ-задачи». Independent of the AI switch, the key and the limits: nothing here calls the model. One open
 * manual batch per admin; only he writes into it (an admin with the finance right may also discard it).
 */
@Service
public class AiManualBatches {

    static final int MAX_ITEMS = 100;
    static final int MAX_PART = 8;
    static final int MAX_DRAFT = 1_000_000;
    private static final Set<BatchStatus> OPEN = EnumSet.of(BatchStatus.RUNNING, BatchStatus.PAUSED);

    /** What the screen starts with: the objects in the order of the parts and the version of each. */
    public record Start(AiFeature feature, String subjectType, List<ManualBatchDto.Item> items, int partSize,
                        String draft) {
    }

    /** The answers pasted for one part; {@code part} — all objects of the part (pending answers missing now go away). */
    public record Answers(String prompt, String promptVersion, List<String> part, List<Answer> answers) {
    }

    public record Answer(String subjectId, String subjectVersion, String answer) {
    }

    /** What {@code ai_batches.subjects} holds. */
    record Subjects(int partSize, String subjectType, List<Subject> items) {
    }

    record Subject(String id, String version, String snapshot) {
    }

    private final AiBatchRepository batches;
    private final AiJobRepository jobs;
    private final AiPastedJobs pasted;
    private final AiBatchReads reads;
    private final AiSubjectChanges changes;
    private final AdminAccess access;
    private final CurrentActor actor;
    private final AdminAuditService audit;
    private final ObjectMapper mapper;
    private final Clock clock;

    public AiManualBatches(AiBatchRepository batches, AiJobRepository jobs, AiPastedJobs pasted, AiBatchReads reads,
                           AiSubjectChanges changes, AdminAccess access, CurrentActor actor, AdminAuditService audit,
                           ObjectMapper mapper, Clock clock) {
        this.batches = batches;
        this.jobs = jobs;
        this.pasted = pasted;
        this.reads = reads;
        this.changes = changes;
        this.access = access;
        this.actor = actor;
        this.audit = audit;
        this.mapper = mapper;
        this.clock = clock;
    }

    @Transactional
    public ManualBatchDto create(Start req) {
        validate(req);
        long adminId = actor.userId();
        current(adminId).ifPresent(b -> {
            throw new DomainException.Conflict(AiError.MANUAL_BATCH_OPEN).withDetails(Map.of("batchId", b.getId()));
        });
        List<Subject> items = req.items().stream()
                .map(i -> new Subject(i.subjectId(), i.subjectVersion(), changes.snapshot(req.subjectType(), i.subjectId())))
                .toList();
        String subjects = json(new Subjects(req.partSize(), req.subjectType(), items));
        AiBatch b = batches.save(AiBatch.manual(req.feature(), adminId, items.size(), subjects, req.draft(),
                clock.instant()));
        audit.record("AI_MANUAL_BATCH", "AI_BATCH", String.valueOf(b.getId()),
                "Вручную через ChatGPT: пакет на " + items.size() + " шт.");
        return dto(b);
    }

    /** The admin's open manual batch, if any: the bar «Продолжить ручной пакет» on any device. */
    @Transactional(readOnly = true)
    public Optional<ManualBatchDto> current() {
        return current(actor.userId()).map(this::dto);
    }

    @Transactional(readOnly = true)
    public ManualBatchDto get(long id) {
        AiBatch b = manual(batches.findById(id));
        long adminId = actor.userId();
        if (b.getAdminId() != adminId && !access.canSeeFinance(adminId)) {
            throw new DomainException.Forbidden(AiError.NOT_YOUR_JOB);
        }
        return dto(b);
    }

    @Transactional
    public ManualBatchDto saveDraft(long id, String draft) {
        if (draft == null || draft.length() > MAX_DRAFT) {
            throw new DomainException.BadRequest(AiError.BAD_REQUEST, "draft");
        }
        AiBatch b = own(id);
        if (!b.saveDraft(draft, clock.instant())) {
            throw new DomainException.Conflict(AiError.BAD_STATE);
        }
        return dto(b);
    }

    /** The answers of one part become jobs (or replace the pending ones); decided jobs stay as they are. */
    @Transactional
    public ManualBatchDto answers(long id, Answers req) {
        AiBatch b = own(id);
        if (!b.getStatus().open()) {
            throw new DomainException.Conflict(AiError.BAD_STATE);
        }
        Subjects s = subjects(b);
        Map<String, Subject> byId = s.items().stream().collect(Collectors.toMap(Subject::id, Function.identity()));
        checkAnswers(req, byId.keySet());
        Instant now = clock.instant();
        Set<String> answered = new HashSet<>();
        for (Answer a : req.answers()) {
            answered.add(a.subjectId());
            AiPastedJobs.Paste p = new AiPastedJobs.Paste(b.getFeature(), s.subjectType(), a.subjectId(),
                    a.subjectVersion(), req.promptVersion(), req.prompt(), a.answer());
            AiPastedJobs.validate(p);
            pasted.inBatch(p, b.getAdminId(), b.getId(), byId.get(a.subjectId()).snapshot(), now);
        }
        req.part().stream().filter(sid -> !answered.contains(sid))
                .forEach(sid -> jobs.findFirstByBatchIdAndSubjectIdOrderByIdDesc(b.getId(), sid).ifPresent(pasted::dropPending));
        return dto(b);
    }

    /** «Закончить»: the batch is done; the answers nobody has decided on stay in «ИИ-задачи → Проверить». */
    @Transactional
    public ManualBatchDto finish(long id) {
        AiBatch b = own(id);
        b.complete(clock.instant());
        return dto(b);
    }

    /** «Удалить»: the batch is canceled, the pending answers go away; what was applied stays applied. */
    @Transactional
    public ManualBatchDto discard(long id) {
        AiBatch b = manual(batches.lockById(id));
        long adminId = actor.userId();
        if (b.getAdminId() != adminId && !access.canSeeFinance(adminId)) {
            throw new DomainException.Forbidden(AiError.NOT_YOUR_JOB);
        }
        if (b.cancel(clock.instant())) {
            jobs.findByBatchIdOrderByIdAsc(id).forEach(pasted::dropPending);
            audit.record("AI_MANUAL_BATCH_DISCARD", "AI_BATCH", String.valueOf(id), "Вручную через ChatGPT: пакет удалён");
        }
        return dto(b);
    }

    private Optional<AiBatch> current(long adminId) {
        return batches.findFirstByAdminIdAndPathAndStatusInOrderByIdDesc(adminId, JobPath.MANUAL, OPEN);
    }

    private AiBatch own(long id) {
        AiBatch b = manual(batches.lockById(id));
        if (b.getAdminId() != actor.userId()) {
            throw new DomainException.Forbidden(AiError.NOT_YOUR_JOB);
        }
        return b;
    }

    private static AiBatch manual(Optional<AiBatch> found) {
        return found.filter(b -> b.getPath() == JobPath.MANUAL)
                .orElseThrow(() -> new DomainException.NotFound(AiError.BATCH_NOT_FOUND));
    }

    private ManualBatchDto dto(AiBatch b) {
        Subjects s = subjects(b);
        List<ManualBatchDto.Item> items = s.items().stream().map(i -> new ManualBatchDto.Item(i.id(), i.version())).toList();
        return new ManualBatchDto(reads.dto(b, access.canSeeFinance(actor.userId())), s.partSize(), items, b.getDraft());
    }

    private Subjects subjects(AiBatch b) {
        try {
            return mapper.readValue(b.getSubjects(), Subjects.class);
        } catch (JsonProcessingException | IllegalArgumentException e) {
            throw new IllegalStateException("manual batch " + b.getId() + ": unreadable subjects", e);
        }
    }

    private String json(Object o) {
        try {
            return mapper.writeValueAsString(o);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException(e);
        }
    }

    private static void checkAnswers(Answers req, Set<String> known) {
        if (req == null || req.part() == null || req.answers() == null || !known.containsAll(req.part())) {
            throw new DomainException.BadRequest(AiError.BAD_REQUEST, "part");
        }
        Set<String> seen = new HashSet<>();
        for (Answer a : req.answers()) {
            if (a == null || !known.contains(a.subjectId()) || !seen.add(a.subjectId())) {
                throw new DomainException.BadRequest(AiError.BAD_REQUEST, "answers");
            }
        }
    }

    static void validate(Start req) {
        if (req == null || req.feature() == null || req.feature() == AiFeature.SEARCH_TEST || req.subjectType() == null
                || req.subjectType().isBlank() || req.subjectType().length() > 24) {
            throw new DomainException.BadRequest(AiError.BAD_REQUEST, "feature");
        }
        if (req.items() == null || req.items().isEmpty() || req.items().size() > MAX_ITEMS) {
            throw new DomainException.BadRequest(AiError.BATCH_SIZE, MAX_ITEMS);
        }
        if (req.partSize() < 1 || req.partSize() > MAX_PART) {
            throw new DomainException.BadRequest(AiError.BAD_REQUEST, "partSize");
        }
        if (req.draft() != null && req.draft().length() > MAX_DRAFT) {
            throw new DomainException.BadRequest(AiError.BAD_REQUEST, "draft");
        }
        Set<String> seen = new HashSet<>();
        for (ManualBatchDto.Item i : req.items()) {
            boolean bad = i == null || i.subjectId() == null || i.subjectId().isBlank() || i.subjectId().length() > 64
                    || i.subjectVersion() == null || i.subjectVersion().isBlank()
                    || i.subjectVersion().length() > AiPastedJobs.MAX_VERSION;
            if (bad || !seen.add(i.subjectId())) {
                throw new DomainException.BadRequest(AiError.BAD_REQUEST, "items");
            }
        }
    }
}
