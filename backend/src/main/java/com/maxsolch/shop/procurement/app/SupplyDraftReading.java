package com.maxsolch.shop.procurement.app;

import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.procurement.domain.SupplyDraft;
import com.maxsolch.shop.procurement.domain.supplyai.DraftState;
import com.maxsolch.shop.procurement.domain.supplyai.ExtractedDoc;
import com.maxsolch.shop.procurement.domain.supplyai.ReadCandidate;
import com.maxsolch.shop.procurement.domain.supplyai.ReviewRow;
import com.maxsolch.shop.procurement.domain.supplyai.SourceLine;
import com.maxsolch.shop.procurement.domain.supplyai.SupplyChecks;
import com.maxsolch.shop.procurement.domain.supplyai.SupplyExtract;
import com.maxsolch.shop.procurement.domain.supplyai.SupplySeams;
import com.maxsolch.shop.procurement.domain.supplyai.SupplyText;
import com.maxsolch.shop.procurement.domain.supplyai.SupplyVerify;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

/**
 * The READ step of a draft: the reading of the invoice, the screenshot overlaps dropped by the total
 * ({@link SupplySeams}) and — while the lines do not add up to the total — a thorough reread of the same pictures
 * ({@link SupplyVerify}), at most {@code verifyBudget} times. The best reading goes on to matching. A reread the admin
 * asked for on a draft under check only adds the lines it found that bring the draft to its total.
 */
@Component
class SupplyDraftReading {

    private final SupplyDraftAi ai;
    private final SupplyDraftMatching matching;
    private final Clock clock;

    SupplyDraftReading(SupplyDraftAi ai, SupplyDraftMatching matching, Clock clock) {
        this.ai = ai;
        this.matching = matching;
        this.clock = clock;
    }

    /** One move; true — the reading is settled and the draft goes on to matching. */
    boolean advance(SupplyDraft d, DraftState s) {
        boolean verifying = !s.getVerifyJobs().isEmpty();
        Long job = verifying ? s.getVerifyJobs().get(s.getVerifyJobs().size() - 1) : s.getReadJob();
        if (job == null) {
            d.fail("Нет задачи чтения накладной", clock.instant());
            return false;
        }
        Optional<SupplyDraftAi.Result> r = ai.result(job, d.getAdminId());
        if (r.isEmpty()) {
            return false;
        }
        SupplyExtract.Parsed p = r.get().done() ? SupplyExtract.parse(r.get().answer()) : null;
        boolean read = p != null && p.doc() != null && !p.doc().lines().isEmpty();
        if (!read && (!verifying || s.getCandidate() == null)) {
            d.fail("Накладную не удалось прочитать: " + why(r.get(), p), clock.instant());
            return false;
        }
        if (!read) {
            s.warn("Перепроверка накладной не удалась (" + why(r.get(), p) + ") — оставлено прошлое чтение");
            return s.isRereadMerge() ? settle(s, null) : settle(s, s.getCandidate());
        }
        ReadCandidate next = ReadCandidate.of(p, SupplySeams.resolve(p.doc(), p.shots()));
        if (s.isRereadMerge()) {
            return settle(s, next);
        }
        ReadCandidate best = s.getCandidate() == null || SupplyVerify.laterIsBetter(s.getCandidate().doc(), next.doc())
                ? next : s.getCandidate();
        s.setCandidate(best);
        if (!SupplyVerify.agrees(best.doc(), best.doc().lines()) && reread(d, s, best)) {
            return false;
        }
        return settle(s, best);
    }

    /**
     * Starts a reread when the budget allows; false — no reread (budget spent, the AI stopped or refused). A draft
     * under check rereads against its current lines, a new one against the best reading.
     */
    boolean reread(SupplyDraft d, DraftState s, ReadCandidate against) {
        if (s.isStopped() || s.getVerifyJobs().size() >= s.getVerifyBudget()) {
            return false;
        }
        int attempt = s.getVerifyJobs().size() + 1;
        try {
            String prompt = SupplyVerify.prompt(against.doc(), against.doc().lines(), against.shots());
            s.getVerifyJobs().add(ai.verify(d.getId(), d.getAdminId(), d.fileIdList(), attempt, prompt));
            return true;
        } catch (DomainException e) {
            s.warn("Перепроверка накладной не запустилась: " + SupplyDraftReasons.of(e.getCode()));
            return false;
        }
    }

    /** The draft's current lines as a reading — what a reread of a draft under check is compared with. */
    static ReadCandidate current(DraftState s) {
        ExtractedDoc doc = s.getDoc();
        List<SourceLine> lines = s.getRows().stream().map(ReviewRow::line).toList();
        ExtractedDoc now = doc.withLines(lines);
        return new ReadCandidate(now, List.of(), s.getRemovedRepeats(), List.of(), null);
    }

    private boolean settle(DraftState s, ReadCandidate best) {
        s.setCandidate(null);
        s.setMatchJob(null);
        if (s.isRereadMerge()) {
            s.setRereadMerge(false);
            if (best != null) {
                merge(s, best);
            }
            return true;
        }
        matching.seed(s, best.toParsed());
        s.setRemovedRepeats(new ArrayList<>(best.removed()));
        if (!s.getVerifyJobs().isEmpty()) {
            s.getDocNotes().add(0, "ИИ перечитал накладную " + s.getVerifyJobs().size() + " раз(а): "
                    + (SupplyVerify.agrees(best.doc(), best.doc().lines()) ? "сумма сходится с итогом" : "сумма всё ещё не сходится"));
        }
        return true;
    }

    /** Adds what a reread found (only lines that bring the draft to its total) as new open lines «R1», «R2»… */
    private void merge(DraftState s, ReadCandidate reread) {
        List<SourceLine> have = s.getRows().stream().map(ReviewRow::line).toList();
        List<SourceLine> found = SupplyVerify.missing(have, reread.doc().lines(), s.getDoc().total());
        if (found.isEmpty()) {
            s.warn("Перечитал накладную — недостающих строк не нашёл. Добавьте строку вручную или примите с расхождением");
            return;
        }
        int n = SupplyText.lastNumber(have.stream().map(SourceLine::id).toList(), "R");
        List<SourceLine> added = new ArrayList<>();
        for (SourceLine l : found) {
            n++;
            added.add(new SourceLine("R" + n, l.text(), l.variant(), l.en(), l.brand(), l.model(), l.color(), l.qty(),
                    l.unitPrice(), l.lineTotal(), l.notes() == null ? "найдено при перечитывании" : l.notes()));
        }
        List<ReviewRow> rows = new ArrayList<>(s.getRows());
        rows.addAll(matching.look(s, added));
        s.setRows(rows);
        s.getDocNotes().add("Перечитано: добавлено строк " + added.size() + " на "
                + SupplyText.num(SupplyChecks.linesSum(added)));
    }

    private static String why(SupplyDraftAi.Result r, SupplyExtract.Parsed p) {
        if (!r.done()) {
            return r.error();
        }
        return p == null || p.errors().isEmpty() ? "строк не найдено" : String.join("; ", p.errors());
    }
}
