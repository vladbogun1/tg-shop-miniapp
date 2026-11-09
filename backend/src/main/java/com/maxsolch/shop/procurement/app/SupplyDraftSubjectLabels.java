package com.maxsolch.shop.procurement.app;

import com.maxsolch.shop.ai.domain.SubjectLabels;
import com.maxsolch.shop.procurement.domain.SupplyDraft;
import com.maxsolch.shop.procurement.domain.supplyai.DraftState;
import com.maxsolch.shop.procurement.domain.supplyai.ReviewRow;
import com.maxsolch.shop.procurement.infra.SupplyDraftRepository;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.Collection;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Names of the draft tasks in «ИИ-задачи → История»: «Черновик поставки №12 · Грипсы … · сопоставление». A deleted
 * draft has no row any more and is named by its number alone.
 */
@Component
class SupplyDraftSubjectLabels implements SubjectLabels {

    private static final Pattern ID = Pattern.compile("d(\\d+)-(read|verify-\\d+|match|c-(.+))");

    private final SupplyDraftRepository drafts;
    private final SupplyDraftJson json;

    SupplyDraftSubjectLabels(SupplyDraftRepository drafts, SupplyDraftJson json) {
        this.drafts = drafts;
        this.json = json;
    }

    @Override
    public String subjectType() {
        return SupplyDraftAi.SUBJECT;
    }

    @Override
    @Transactional(readOnly = true)
    public Map<String, String> labels(Collection<String> subjectIds) {
        Set<Long> ids = new LinkedHashSet<>();
        for (String s : subjectIds) {
            Matcher m = ID.matcher(s);
            if (m.matches()) {
                ids.add(Long.parseLong(m.group(1)));
            }
        }
        Map<Long, SupplyDraft> byId = new HashMap<>();
        drafts.findAllById(ids).forEach(d -> byId.put(d.getId(), d));
        Map<String, String> out = new HashMap<>();
        for (String s : subjectIds) {
            Matcher m = ID.matcher(s);
            if (m.matches()) {
                out.put(s, label(Long.parseLong(m.group(1)), byId.get(Long.parseLong(m.group(1))), m));
            }
        }
        return out;
    }

    private String label(long id, SupplyDraft d, Matcher m) {
        String head = "Черновик поставки №" + id;
        if (d == null) {
            return head + " (удалён) · " + step(m, null);
        }
        String title = d.getTitle() == null || d.getTitle().isBlank() ? "" : " · " + d.getTitle();
        return head + title + " · " + step(m, d);
    }

    private String step(Matcher m, SupplyDraft d) {
        return switch (m.group(2)) {
            case "read" -> "чтение накладной";
            case "match" -> "сопоставление";
            default -> m.group(2).startsWith("verify-") ? "перепроверка накладной" : "карточка" + newTitle(d, m.group(3));
        };
    }

    /** The title of the new product of the card, « «Глайды X»», or nothing when the line is no longer new. */
    private String newTitle(SupplyDraft d, String lineId) {
        if (d == null || d.getState() == null) {
            return "";
        }
        DraftState s = json.read(d.getState());
        return s.getRows().stream()
                .filter(r -> r.line().id().equals(lineId) && r.decision().draft() != null)
                .map(ReviewRow::decision)
                .map(dec -> " «" + dec.draft().title() + "»")
                .findFirst().orElse("");
    }
}
