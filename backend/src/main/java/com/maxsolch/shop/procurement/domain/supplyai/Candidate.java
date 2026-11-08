package com.maxsolch.shop.procurement.domain.supplyai;

/** A search candidate for a line. Same as Candidate in frontend-admin/features/supply/model/ai/types.ts. */
public record Candidate(String productId, String variantId, double score) {
}
