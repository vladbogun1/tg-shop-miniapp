package com.maxsolch.shop.procurement.app;

import com.fasterxml.jackson.databind.JsonNode;
import com.maxsolch.shop.ai.app.AiFiles;
import com.maxsolch.shop.ai.app.AiJobs;
import com.maxsolch.shop.ai.domain.AiError;
import com.maxsolch.shop.audit.app.AdminAuditService;
import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.platform.security.AdminAccess;
import com.maxsolch.shop.platform.web.CurrentActor;
import com.maxsolch.shop.procurement.app.SupplyDraftDtos.DraftAcceptResult;
import com.maxsolch.shop.procurement.app.SupplyDraftDtos.DraftDto;
import com.maxsolch.shop.procurement.app.SupplyDraftDtos.DraftSummary;
import com.maxsolch.shop.procurement.app.SupplyDraftDtos.DraftSaveRequest;
import com.maxsolch.shop.procurement.domain.ProcurementError;
import com.maxsolch.shop.procurement.domain.SupplyDraft;
import com.maxsolch.shop.procurement.domain.SupplyDraft.Status;
import com.maxsolch.shop.procurement.domain.SupplyDraft.Step;
import com.maxsolch.shop.procurement.domain.supplyai.DraftState;
import com.maxsolch.shop.procurement.domain.supplyai.SupplyExtract;
import com.maxsolch.shop.procurement.infra.SupplyDraftRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;

/**
 * «Поставка с ИИ» as a draft kept on the server: the admin gives the invoice pictures and leaves; the timer walks the
 * steps ({@link SupplyDraftPipeline}); the admin comes back to the check screen, corrects and accepts
 * ({@link SupplyDraftAccept}). Every change of a draft takes its row lock, so a tick of the timer and a click of the
 * admin never write over each other; the screen's corrections also carry the version they were made on.
 */
@Service
public class SupplyDrafts {

    private static final List<Status> OPEN = List.of(Status.RUNNING, Status.READY, Status.FAILED);

    private final SupplyDraftRepository drafts;
    private final SupplyDraftJson json;
    private final SupplyDraftAi ai;
    private final SupplyDraftView view;
    private final SupplyDraftAccept acceptance;
    private final AiJobs aiJobs;
    private final CurrentActor actor;
    private final AdminAccess access;
    private final AdminAuditService audit;
    private final Clock clock;

    SupplyDrafts(SupplyDraftRepository drafts, SupplyDraftJson json, SupplyDraftAi ai, SupplyDraftView view,
                 SupplyDraftAccept acceptance, AiJobs aiJobs, CurrentActor actor, AdminAccess access,
                 AdminAuditService audit, Clock clock) {
        this.drafts = drafts;
        this.json = json;
        this.ai = ai;
        this.view = view;
        this.acceptance = acceptance;
        this.aiJobs = aiJobs;
        this.actor = actor;
        this.access = access;
        this.audit = audit;
        this.clock = clock;
    }

    /** Saves the draft and starts reading the invoice; a refusal of the AI (limits, switched off) creates nothing. */
    @Transactional
    public DraftDto create(List<Long> fileIds) {
        List<Long> ids = List.copyOf(new LinkedHashSet<>(fileIds == null ? List.of() : fileIds));
        if (ids.isEmpty() || ids.size() > AiFiles.MAX_IMAGES) {
            throw new DomainException.BadRequest(AiError.FILES_LIMIT, AiFiles.MAX_IMAGES);
        }
        long adminId = actor.userId();
        SupplyDraft d = drafts.saveAndFlush(SupplyDraft.start(adminId, ids, json.write(new DraftState()), clock.instant()));
        DraftState s = new DraftState();
        s.setReadJob(ai.read(d.getId(), adminId, ids, SupplyExtract.PROMPT, SupplyExtract.PROMPT_VERSION));
        d.write(json.write(s), null, clock.instant());
        audit.record("SUPPLY_DRAFT_CREATE", "SUPPLY_DRAFT", String.valueOf(d.getId()), "Поставка с ИИ: черновик, файлов " + ids.size());
        return view.of(drafts.saveAndFlush(d), finance());
    }

    @Transactional(readOnly = true)
    public List<DraftSummary> list() {
        long me = actor.userId();
        boolean finance = finance();
        return drafts.findByStatusInOrderByIdDesc(OPEN).stream().filter(d -> d.visibleTo(me, finance))
                .map(view::summary).toList();
    }

    @Transactional(readOnly = true)
    public DraftDto get(long id) {
        return view.of(visible(drafts.findById(id).orElse(null)), finance());
    }

    /** The admin's corrections on the check screen. */
    @Transactional
    public DraftDto save(long id, DraftSaveRequest req) {
        SupplyDraft d = lockedVisible(id);
        if (d.getStatus() != Status.READY) {
            throw new DomainException.Conflict(ProcurementError.DRAFT_BAD_STATE);
        }
        if (req.version() != d.getVersion()) {
            throw new DomainException.Conflict(ProcurementError.DRAFT_CHANGED);
        }
        DraftState s = json.read(d.getState());
        SupplyDraftEdits.apply(s, req);
        if (req.descriptions() != null) {
            req.descriptions().forEach((key, text) -> {
                JsonNode card = s.getCards().get(key);
                if (card != null) {
                    s.getCards().put(key, view.withDescription(card, text));
                }
            });
        }
        d.write(json.write(s), s.getTitle(), clock.instant());
        return view.of(drafts.saveAndFlush(d), finance());
    }

    /**
     * Once more: a failed reading — the same pictures read again (a more thorough attempt); a ready draft — the AI
     * takes up what it did not finish (open lines, missing cards). What the admin has decided stays.
     */
    @Transactional
    public DraftDto retry(long id) {
        SupplyDraft d = lockedVisible(id);
        DraftState s = json.read(d.getState());
        if (d.getStatus() == Status.FAILED && d.getStep() == Step.READ && s.getReadJob() != null) {
            s.setReadJob(aiJobs.retry(s.getReadJob()).id());
            d.runStep(Step.READ, clock.instant());
        } else if (d.getStatus() == Status.READY || d.getStatus() == Status.FAILED) {
            s.setStopped(false);
            s.setMatchJob(null);
            s.getCardJobs().keySet().removeIf(key -> !s.getCards().containsKey(key));
            s.getWarnings().clear();
            d.runStep(s.getDoc() == null ? Step.READ : Step.MATCH, clock.instant());
        } else {
            throw new DomainException.Conflict(ProcurementError.DRAFT_BAD_STATE);
        }
        d.write(json.write(s), s.getTitle(), clock.instant());
        return view.of(drafts.saveAndFlush(d), finance());
    }

    /** Stops the AI: running tasks are cancelled, no new ones start; the draft goes to the check with what it has. */
    @Transactional
    public DraftDto stop(long id) {
        SupplyDraft d = lockedVisible(id);
        if (d.getStatus() != Status.RUNNING) {
            throw new DomainException.Conflict(ProcurementError.DRAFT_BAD_STATE);
        }
        DraftState s = json.read(d.getState());
        s.setStopped(true);
        cancelAll(s);
        if (d.getStep() == Step.READ) {
            d.fail("Остановлено до того, как накладная прочитана", clock.instant());
        }
        d.write(json.write(s), s.getTitle(), clock.instant());
        return view.of(drafts.saveAndFlush(d), finance());
    }

    /** Deletes a draft that did not become a batch (its tasks are cancelled; what they cost stays in the AI journal). */
    @Transactional
    public void delete(long id) {
        SupplyDraft d = lockedVisible(id);
        if (d.getStatus() == Status.ACCEPTED) {
            throw new DomainException.Conflict(ProcurementError.DRAFT_BAD_STATE);
        }
        cancelAll(json.read(d.getState()));
        drafts.delete(d);
        audit.record("SUPPLY_DRAFT_DELETE", "SUPPLY_DRAFT", String.valueOf(id), "Поставка с ИИ: черновик удалён");
    }

    @Transactional
    public DraftAcceptResult accept(long id, long version) {
        SupplyDraft d = lockedVisible(id);
        if (d.getStatus() != Status.READY) {
            throw new DomainException.Conflict(ProcurementError.DRAFT_BAD_STATE);
        }
        if (version != d.getVersion()) {
            throw new DomainException.Conflict(ProcurementError.DRAFT_CHANGED);
        }
        return acceptance.accept(d, json.read(d.getState()), finance());
    }

    private void cancelAll(DraftState s) {
        ai.cancel(s.getReadJob());
        ai.cancel(s.getMatchJob());
        for (Map.Entry<String, Long> e : s.getCardJobs().entrySet()) {
            ai.cancel(e.getValue());
        }
    }

    private SupplyDraft lockedVisible(long id) {
        return visible(drafts.lockById(id).orElse(null));
    }

    private SupplyDraft visible(SupplyDraft d) {
        if (d == null || !d.visibleTo(actor.userId(), finance())) {
            throw new DomainException.NotFound(ProcurementError.DRAFT_NOT_FOUND);
        }
        return d;
    }

    private boolean finance() {
        return access.canSeeFinance(actor.userId());
    }
}
