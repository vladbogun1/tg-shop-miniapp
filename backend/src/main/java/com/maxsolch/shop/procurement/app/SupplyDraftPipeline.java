package com.maxsolch.shop.procurement.app;

import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.platform.tx.DomainEvents;
import com.maxsolch.shop.procurement.domain.SupplyDraft;
import com.maxsolch.shop.procurement.domain.SupplyDraft.Step;
import com.maxsolch.shop.procurement.domain.SupplyDraftEvents;
import com.maxsolch.shop.procurement.domain.supplyai.CatalogItem;
import com.maxsolch.shop.procurement.domain.supplyai.DraftState;
import com.maxsolch.shop.procurement.domain.supplyai.LeafCategory;
import com.maxsolch.shop.procurement.domain.supplyai.LineDecision;
import com.maxsolch.shop.procurement.domain.supplyai.MatchPrompt;
import com.maxsolch.shop.procurement.domain.supplyai.ReviewRow;
import com.maxsolch.shop.procurement.domain.supplyai.SupplyMatcher;
import com.maxsolch.shop.procurement.domain.supplyai.SupplyPlan;
import com.maxsolch.shop.procurement.infra.SupplyDraftRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

/**
 * One move of a running supply draft, called by the timer ({@link SupplyDraftJobs}) under the row lock: look at the
 * task of the current step; while it runs — nothing; when it ended — take its answer into the state and start the
 * next step. READ → the invoice, rereads while its lines do not add up to its total, the first look
 * ({@link SupplyDraftReading}); MATCH → the model decides the open
 * lines; CARDS → a card for every new product ({@link SupplyDraftCards}); then READY and a push. Only a failed reading
 * stops the draft: without lines there is nothing to check. A failed match or card is a warning — the admin finishes
 * those lines by hand on the check screen.
 */
@Service
public class SupplyDraftPipeline {

    private final SupplyDraftRepository drafts;
    private final SupplyDraftJson json;
    private final SupplyDraftAi ai;
    private final SupplyDraftReading reading;
    private final SupplyDraftCards cards;
    private final SupplyDraftCatalog catalog;
    private final DomainEvents events;
    private final Clock clock;

    SupplyDraftPipeline(SupplyDraftRepository drafts, SupplyDraftJson json, SupplyDraftAi ai, SupplyDraftReading reading,
                        SupplyDraftCards cards, SupplyDraftCatalog catalog, DomainEvents events, Clock clock) {
        this.drafts = drafts;
        this.json = json;
        this.ai = ai;
        this.reading = reading;
        this.cards = cards;
        this.catalog = catalog;
        this.events = events;
        this.clock = clock;
    }

    @Transactional
    public void advance(long id) {
        SupplyDraft d = drafts.lockById(id).orElse(null);
        if (d == null || d.getStatus() != SupplyDraft.Status.RUNNING) {
            return;
        }
        DraftState s = json.read(d.getState());
        switch (d.getStep()) {
            case READ -> read(d, s);
            case MATCH -> match(d, s);
            case CARDS -> {
                if (cards.advance(d, s)) {
                    finish(d, s);
                }
            }
            case DONE -> finish(d, s);
        }
        String next = json.write(s);
        if (!next.equals(d.getState())) {
            d.write(next, s.getTitle(), clock.instant());
        }
    }

    /** An unexpected error of a move: the draft stops with it instead of failing on every tick. */
    @Transactional
    public void crashed(long id, String what) {
        drafts.lockById(id).filter(d -> d.getStatus() == SupplyDraft.Status.RUNNING)
                .ifPresent(d -> d.fail("Сбой сервера на шаге «" + d.getStep() + "»: " + what + ". Нажмите «Повторить».", clock.instant()));
    }

    private void read(SupplyDraft d, DraftState s) {
        if (reading.advance(d, s)) {
            d.runStep(Step.MATCH, clock.instant());
        }
    }

    private void match(SupplyDraft d, DraftState s) {
        if (s.getMatchJob() == null) {
            startMatch(d, s);
            return;
        }
        Optional<SupplyDraftAi.Result> r = ai.result(s.getMatchJob(), d.getAdminId());
        if (r.isEmpty()) {
            return;
        }
        if (r.get().done()) {
            applyMatch(s, r.get().answer());
        } else {
            s.warn("ИИ не сопоставил строки: " + r.get().error() + " — решите их вручную");
        }
        toCards(d, s);
    }

    private void startMatch(SupplyDraft d, DraftState s) {
        List<ReviewRow> open = s.openRows();
        if (open.isEmpty() || s.isStopped()) {
            toCards(d, s);
            return;
        }
        try {
            String prompt = MatchPrompt.build(open, catalog.items(), catalog.leaves());
            s.setMatchJob(ai.match(d.getId(), d.getAdminId(), open.size(), prompt, MatchPrompt.PROMPT_VERSION));
        } catch (DomainException e) {
            s.warn("Сопоставление ИИ не запустилось: " + SupplyDraftReasons.of(e.getCode()) + " — решите строки вручную");
            toCards(d, s);
        }
    }

    private void applyMatch(DraftState s, String answer) {
        List<ReviewRow> open = s.openRows();
        List<CatalogItem> items = catalog.items();
        List<LeafCategory> leaves = catalog.leaves();
        MatchPrompt.Result res = MatchPrompt.parse(answer, open, items, leaves);
        List<ReviewRow> rows = new ArrayList<>();
        for (ReviewRow row : s.getRows()) {
            boolean undecided = "open".equals(row.decision().kind());
            LineDecision next = undecided ? res.decisions().get(row.line().id()) : null;
            List<String> choice = undecided ? res.choices().get(row.line().id()) : null;
            if (next != null) {
                rows.add(new ReviewRow(row.line(), next, row.candidates()));
            } else if (choice != null) {
                rows.add(new ReviewRow(row.line(), row.decision(), SupplyMatcher.shortList(row.line(), choice, items)));
            } else {
                rows.add(row);
            }
        }
        s.setRows(rows);
        s.getLineNotes().putAll(res.notes());
        res.errors().forEach(e -> s.warn("Ответ ИИ по строкам: " + e));
    }

    private void toCards(SupplyDraft d, DraftState s) {
        cards.proposePrices(s);
        d.runStep(Step.CARDS, clock.instant());
    }

    private void finish(SupplyDraft d, DraftState s) {
        d.ready(clock.instant());
        int lines = s.getRows().size();
        int fresh = SupplyPlan.newProducts(s.getRows()).size();
        events.publish(new SupplyDraftEvents.Ready(d.getId(), d.getAdminId(), s.getTitle(), lines, fresh));
    }
}
