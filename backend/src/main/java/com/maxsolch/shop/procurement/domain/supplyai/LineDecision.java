package com.maxsolch.shop.procurement.domain.supplyai;

/**
 * Decision for a line: our product, a new product, skip, or not decided yet. Same four kinds as LineDecision
 * in frontend-admin/features/supply/model/ai/types.ts; fields that do not belong to the kind are null.
 *
 * @param kind  match | new | skip | open
 * @param by    memory | search | ai | admin (only for "match")
 * @param draft only for "new"
 */
public record LineDecision(String kind, String productId, String variantId, String by, NewProductDraft draft) {

    public static LineDecision match(String productId, String variantId, String by) {
        return new LineDecision("match", productId, variantId, by, null);
    }

    public static LineDecision fresh(NewProductDraft draft) {
        return new LineDecision("new", null, null, null, draft);
    }

    public static LineDecision skip() {
        return new LineDecision("skip", null, null, null, null);
    }

    public static LineDecision open() {
        return new LineDecision("open", null, null, null, null);
    }
}
