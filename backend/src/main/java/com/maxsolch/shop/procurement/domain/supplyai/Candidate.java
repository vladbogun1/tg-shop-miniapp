package com.maxsolch.shop.procurement.domain.supplyai;

/**
 * A candidate for a line. Same as Candidate in frontend-admin/features/supply/model/ai/types.ts.
 *
 * @param ai the AI's short list («one of these, the invoice does not say which»), not a search guess
 */
public record Candidate(String productId, String variantId, double score, boolean ai) {

    public Candidate(String productId, String variantId, double score) {
        this(productId, variantId, score, false);
    }
}
