package com.maxsolch.shop.procurement.domain.supplyai;

/** A leaf category offered to the AI in step 2. Same as LeafCategory in match-prompt.ts. */
public record LeafCategory(String id, String slug, String name) {
}
