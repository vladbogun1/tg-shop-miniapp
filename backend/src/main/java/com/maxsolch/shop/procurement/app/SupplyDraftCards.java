package com.maxsolch.shop.procurement.app;

import com.maxsolch.shop.catalog.app.CardDraft;
import com.maxsolch.shop.catalog.app.NewProductCards;
import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.procurement.domain.SupplyDraft;
import com.maxsolch.shop.procurement.domain.supplyai.DraftState;
import com.maxsolch.shop.procurement.domain.supplyai.LineDecision;
import com.maxsolch.shop.procurement.domain.supplyai.NewProductDraft;
import com.maxsolch.shop.procurement.domain.supplyai.ReviewRow;
import com.maxsolch.shop.procurement.domain.supplyai.SourceLine;
import com.maxsolch.shop.procurement.domain.supplyai.SupplyPlan;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.stream.Collectors;
import java.util.stream.Stream;

/**
 * The cards step of a supply draft: one AI card task per new product (the same prompt the «Карточки» screen builds,
 * for a product that has nothing yet — no description, no specs, no photo), its answer kept in the draft until the
 * admin accepts. A ready card names the product properly and puts it into a leaf category with its brand. The prices
 * of new products are proposed before: purchase × rate × 2, rounded to tens.
 */
@Component
class SupplyDraftCards {

    private final SupplyDraftAi ai;
    private final NewProductCards cards;
    private final SupplyDraftJson json;

    SupplyDraftCards(SupplyDraftAi ai, NewProductCards cards, SupplyDraftJson json) {
        this.ai = ai;
        this.cards = cards;
        this.json = json;
    }

    /** Sale prices for the new products that have none yet (the admin's own price is never replaced). */
    void proposePrices(DraftState s) {
        for (SupplyPlan.NewProduct p : SupplyPlan.newProducts(s.getRows())) {
            String key = keyOf(p, s);
            Double unit = unitPrice(p, s);
            if (!s.getPrices().containsKey(key) && unit != null && s.getFxRate() != null) {
                s.getPrices().put(key, Math.round(SupplyPlan.draftPriceUah(unit, s.getFxRate().doubleValue())));
            }
        }
    }

    /** One move of the step; true when every new product has its card or its card will not come. */
    boolean advance(SupplyDraft d, DraftState s) {
        boolean waiting = false;
        boolean refused = false;
        for (SupplyPlan.NewProduct p : SupplyPlan.newProducts(s.getRows())) {
            String key = keyOf(p, s);
            if (s.getCards().containsKey(key)) {
                continue;
            }
            Long job = s.getCardJobs().get(key);
            if (job == null) {
                if (!s.isStopped() && !refused) {
                    refused = !start(d, s, p, key);
                    waiting |= !refused;
                }
                continue;
            }
            Optional<SupplyDraftAi.Result> r = ai.result(job, d.getAdminId());
            if (r.isEmpty()) {
                waiting = true;
            } else {
                take(d, s, p, key, r.get());
            }
        }
        return !waiting;
    }

    /** The key a new product is known by in the draft: the line that already has its card or task, else its first line. */
    static String keyOf(SupplyPlan.NewProduct p, DraftState s) {
        return p.lineIds().stream()
                .filter(id -> s.getCards().containsKey(id) || s.getCardJobs().containsKey(id))
                .findFirst().orElse(p.lineIds().get(0));
    }

    /** The key of the product inside the card prompt and answer («p» + 8 hex), stable for the draft and the line. */
    static String promptKey(long draftId, String key) {
        try {
            byte[] sum = MessageDigest.getInstance("SHA-256").digest(("d" + draftId + "-" + key).getBytes(StandardCharsets.UTF_8));
            return "p" + HexFormat.of().formatHex(sum).substring(0, 8);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    private boolean start(SupplyDraft d, DraftState s, SupplyPlan.NewProduct p, String key) {
        try {
            Long price = s.getPrices().get(key);
            String prompt = cards.prompt(List.of(new NewProductCards.Input(promptKey(d.getId(), key), p.title(), p.brand(),
                    p.categoryId(), p.variants(), price, note(p, s))));
            s.getCardJobs().put(key, ai.card(d.getId(), d.getAdminId(), key, prompt));
            return true;
        } catch (DomainException e) {
            s.warn("Карточки ИИ не запустились: " + SupplyDraftReasons.of(e.getCode()) + " — заполните их после создания");
            return false;
        }
    }

    private void take(SupplyDraft d, DraftState s, SupplyPlan.NewProduct p, String key, SupplyDraftAi.Result r) {
        if (!r.done()) {
            s.warn("Карточка «" + p.title() + "»: " + r.error());
            return;
        }
        Optional<CardDraft> card = cards.parse(r.answer(), promptKey(d.getId(), key));
        if (card.isEmpty()) {
            s.warn("Карточка «" + p.title() + "»: ответ ИИ не удалось прочитать");
            return;
        }
        s.getCards().put(key, json.tree(card.get()));
        name(s, p, card.get());
    }

    /** The card's title, leaf category and brand go into the plan of the product (on all its lines). */
    private static void name(DraftState s, SupplyPlan.NewProduct p, CardDraft card) {
        String title = card.title() == null ? null : card.title().get("ru");
        List<ReviewRow> rows = new ArrayList<>();
        for (ReviewRow row : s.getRows()) {
            NewProductDraft draft = row.decision().draft();
            if (!"new".equals(row.decision().kind()) || draft == null || !p.lineIds().contains(row.line().id())) {
                rows.add(row);
                continue;
            }
            NewProductDraft named = new NewProductDraft(
                    title == null || title.isBlank() ? draft.title() : title.trim(),
                    blank(draft.brand()) ? card.brand() : draft.brand(),
                    card.categoryId() != null ? card.categoryId() : draft.categoryId(),
                    draft.variant(), draft.source());
            rows.add(new ReviewRow(row.line(), LineDecision.fresh(named), row.candidates()));
        }
        s.setRows(rows);
    }

    private static String note(SupplyPlan.NewProduct p, DraftState s) {
        return s.getRows().stream().filter(r -> p.lineIds().contains(r.line().id())).map(ReviewRow::line)
                .map(l -> Stream.of(l.text(), l.en(), l.model(), l.color(), l.variant()).filter(v -> !blank(v))
                        .distinct().collect(Collectors.joining(" · ")))
                .distinct().collect(Collectors.joining("\n"));
    }

    /** The purchase price of one unit across the product's lines (weighted by quantity); null if a line has none. */
    static Double unitPrice(SupplyPlan.NewProduct p, DraftState s) {
        List<SourceLine> lines = s.getRows().stream().filter(r -> p.lineIds().contains(r.line().id()))
                .map(ReviewRow::line).toList();
        if (lines.isEmpty() || lines.stream().map(SourceLine::unitPrice).anyMatch(Objects::isNull)) {
            return null;
        }
        double sum = lines.stream().mapToDouble(l -> l.unitPrice() * l.qty()).sum();
        int qty = lines.stream().mapToInt(SourceLine::qty).sum();
        return qty == 0 ? null : sum / qty;
    }

    private static boolean blank(String v) {
        return v == null || v.isBlank();
    }
}
