package com.maxsolch.shop.procurement.app;

import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.procurement.app.SupplyDraftDtos.SaveRequest;
import com.maxsolch.shop.procurement.domain.ProcurementError;
import com.maxsolch.shop.procurement.domain.supplyai.DraftState;
import com.maxsolch.shop.procurement.domain.supplyai.LineDecision;
import com.maxsolch.shop.procurement.domain.supplyai.ReviewRow;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * The corrections of the check screen applied to the state. Only what makes sense is taken: decisions of lines that
 * exist (of a known kind), prices above zero, a currency the batches know, a rate above zero, 0–52 weeks. A wrong
 * value is a refusal (the screen never sends one; a hand-made request should not leave a broken draft).
 */
final class SupplyDraftEdits {

    private static final Set<String> KINDS = Set.of("match", "new", "skip", "open");
    private static final int MAX_WEEKS = 52;

    private SupplyDraftEdits() {
    }

    static void apply(DraftState s, SaveRequest req) {
        if (req.decisions() != null) {
            decisions(s, req.decisions());
        }
        if (req.prices() != null) {
            req.prices().forEach((key, price) -> {
                if (price == null || price <= 0) {
                    s.getPrices().remove(key);
                } else {
                    s.getPrices().put(key, price);
                }
            });
        }
        head(s, req);
    }

    private static void decisions(DraftState s, Map<String, LineDecision> decisions) {
        List<ReviewRow> rows = new ArrayList<>();
        for (ReviewRow row : s.getRows()) {
            LineDecision next = decisions.get(row.line().id());
            if (next != null && !valid(next)) {
                throw bad();
            }
            rows.add(next == null ? row : new ReviewRow(row.line(), next, row.candidates()));
        }
        s.setRows(rows);
    }

    private static boolean valid(LineDecision d) {
        if (!KINDS.contains(d.kind())) {
            return false;
        }
        return switch (d.kind()) {
            case "match" -> d.productId() != null && !d.productId().isBlank();
            case "new" -> d.draft() != null && d.draft().title() != null && !d.draft().title().isBlank()
                    && d.draft().title().length() <= 255;
            default -> true;
        };
    }

    /** The head of the future batch; supplier id 0 — «a new supplier» named by {@code supplierName}. */
    private static void head(DraftState s, SaveRequest req) {
        if (req.supplierId() != null) {
            s.setSupplierId(req.supplierId() == 0 ? null : req.supplierId());
        }
        if (req.supplierName() != null) {
            s.setSupplierName(blankToNull(req.supplierName()));
        }
        if (req.currency() != null) {
            if (!PreorderBatchService.CURRENCIES.contains(req.currency())) {
                throw bad();
            }
            s.setCurrency(req.currency());
        }
        if (req.fxRate() != null) {
            if (req.fxRate().compareTo(BigDecimal.ZERO) <= 0) {
                throw bad();
            }
            s.setFxRate(req.fxRate());
        }
        if (req.title() != null) {
            s.setTitle(blankToNull(req.title()));
        }
        if (req.etaWeeks() != null) {
            if (req.etaWeeks() < 0 || req.etaWeeks() > MAX_WEEKS) {
                throw bad();
            }
            s.setEtaWeeks(req.etaWeeks());
        }
        if (req.preorderOpen() != null) {
            s.setPreorderOpen(req.preorderOpen());
        }
    }

    private static String blankToNull(String v) {
        return v == null || v.isBlank() ? null : v.trim();
    }

    private static DomainException bad() {
        return new DomainException.BadRequest(ProcurementError.DRAFT_NOT_READY, "неверные данные правки");
    }
}
