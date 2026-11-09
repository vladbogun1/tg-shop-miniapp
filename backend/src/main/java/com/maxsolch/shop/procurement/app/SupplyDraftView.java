package com.maxsolch.shop.procurement.app;

import com.fasterxml.jackson.databind.JsonNode;
import com.maxsolch.shop.ai.app.AiJobDto;
import com.maxsolch.shop.ai.domain.JobStatus;
import com.maxsolch.shop.catalog.app.CardDraft;
import com.maxsolch.shop.procurement.app.SupplyDraftDtos.DraftDto;
import com.maxsolch.shop.procurement.app.SupplyDraftDtos.DraftSummary;
import com.maxsolch.shop.procurement.app.SupplyDraftDtos.DraftJobView;
import com.maxsolch.shop.procurement.app.SupplyDraftDtos.DraftSumInfo;
import com.maxsolch.shop.procurement.domain.SupplyDraft;
import com.maxsolch.shop.procurement.domain.supplyai.DraftState;
import com.maxsolch.shop.procurement.domain.supplyai.SupplyPlan;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/**
 * A draft as the screens get it: the state plus the AI tasks of each step with what they do now. The cost of the
 * tasks — only for the finance right (it is the shop's money, the others see the progress without it).
 */
@Component
class SupplyDraftView {

    private final SupplyDraftJson json;
    private final SupplyDraftAi ai;

    SupplyDraftView(SupplyDraftJson json, SupplyDraftAi ai) {
        this.json = json;
        this.ai = ai;
    }

    DraftDto of(SupplyDraft d, boolean finance) {
        DraftState s = json.read(d.getState());
        List<DraftJobView> jobs = jobs(d, s, finance);
        Long cost = finance ? jobs.stream().map(DraftJobView::costMinor).filter(Objects::nonNull).reduce(0L, Long::sum) : null;
        Map<String, CardDraft> cards = new LinkedHashMap<>();
        s.getCards().forEach((k, v) -> {
            CardDraft c = json.convert(v, CardDraft.class);
            if (c != null) {
                cards.put(k, c);
            }
        });
        return new DraftDto(d.getId(), d.getVersion(), d.getStatus(), d.getStep(), d.getTitle(), d.getFailure(),
                d.getBatchId(), d.getCreatedAt(), d.getReadyAt(), s.getDoc(), s.getDocNotes(), s.getRows(),
                s.getLineNotes(), s.getWarnings(), cards, s.getPrices(), s.isStopped(), s.getSupplierId(),
                s.getSupplierName(), s.getCurrency(), s.getFxRate(), s.getEtaWeeks(), s.isPreorderOpen(), jobs, cost,
                new DraftSumInfo(s.getVerifyJobs().size(), List.copyOf(s.getRemovedRepeats())));
    }

    DraftSummary summary(SupplyDraft d) {
        DraftState s = json.read(d.getState());
        return new DraftSummary(d.getId(), d.getStatus(), d.getStep(), d.getTitle(), d.getFailure(), s.getRows().size(),
                SupplyPlan.newProducts(s.getRows()).size(), s.openRows().size(), d.getCreatedAt(), d.getUpdatedAt(),
                d.getReadyAt());
    }

    private List<DraftJobView> jobs(SupplyDraft d, DraftState s, boolean finance) {
        List<DraftJobView> out = new ArrayList<>();
        add(out, "READ", null, "Чтение накладной", s.getReadJob(), d, finance);
        for (int i = 0; i < s.getVerifyJobs().size(); i++) {
            add(out, "VERIFY", null, "Перепроверка накладной" + (i == 0 ? "" : " №" + (i + 1)) + " (тщательно)",
                    s.getVerifyJobs().get(i), d, finance);
        }
        add(out, "MATCH", null, "Сопоставление строк с каталогом", s.getMatchJob(), d, finance);
        Map<String, String> titles = new LinkedHashMap<>();
        SupplyPlan.newProducts(s.getRows()).forEach(p -> titles.put(SupplyDraftCards.keyOf(p, s), p.title()));
        s.getCardJobs().forEach((key, job) ->
                add(out, "CARD", key, "Карточка «" + titles.getOrDefault(key, key) + "»", job, d, finance));
        return out;
    }

    private void add(List<DraftJobView> out, String kind, String key, String label, Long jobId, SupplyDraft d, boolean finance) {
        if (jobId == null) {
            return;
        }
        AiJobDto j = ai.job(jobId, d.getAdminId());
        if (j == null) {
            out.add(new DraftJobView(kind, key, label, jobId, "FAILED", null, "задача ИИ не найдена", null));
            return;
        }
        String error = j.status().active() || j.status() == JobStatus.DONE ? null : SupplyDraftAi.failure(j);
        out.add(new DraftJobView(kind, key, label, jobId, j.status().name(), j.step(), error, finance ? j.costMinor() : null));
    }

    /** The state's card of a product with the admin's description (the AI translations of the old one are dropped). */
    JsonNode withDescription(JsonNode card, String description) {
        CardDraft c = json.convert(card, CardDraft.class);
        if (c == null) {
            return card;
        }
        Map<String, String> ru = description == null || description.isBlank() ? Map.of() : Map.of("ru", description.trim());
        return json.tree(new CardDraft(c.categorySlug(), c.categoryId(), c.brand(), c.specs(), c.confidence(), c.overall(),
                c.title(), ru, c.conditionNote(), c.sources(), c.photos(), c.fieldSources(), c.notes()));
    }
}
