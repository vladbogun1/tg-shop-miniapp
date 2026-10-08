package com.maxsolch.shop.web.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

import java.util.List;
import java.util.Map;

public record ProductUpsertRequest(
        @NotBlank @Size(max = 255) String title,
        @Size(max = 20_000) String description,
        @PositiveOrZero long priceMinor,
        @Size(max = 8) String currency,
        /** Absolute stock; {@code null} = leave the stored value alone (the admin did not touch it). */
        @PositiveOrZero Integer stock,
        Boolean active,
        @Size(max = 30) List<@Size(max = 2048) String> imageKeys,
        @Valid @Size(max = 100) List<VariantInput> variants,
        // ---- public site (all optional; null = keep the current value) ----
        /** Blank = generate from the title; otherwise normalised to [a-z0-9-]. */
        @Size(max = 160) String slug,
        /** Struck-through "old" price; 0 or negative clears it. */
        Long compareAtMinor,
        @Size(max = 255) String seoTitle,
        @Size(max = 512) String seoDescription,
        /** Article number, unique among products; blank clears it. */
        @Size(max = 64) String sku,
        /**
         * Stock the admin saw when the form was opened. When {@code stock} changes and the stored
         * value no longer equals this, the save is rejected with 409 STOCK_CONFLICT instead of
         * silently overwriting units sold in the meantime. {@code null} = no check (older builds).
         */
        @PositiveOrZero Integer expectedStock,
        // ---- catalog v2 (V52, docs/CATALOG-SPECS.md §3.3); null = keep ----
        /** Leaf category; required for a new product. */
        String categoryId,
        /** Brand from the directory; "" clears. Wins over {@code brandName}. */
        String brandId,
        /** Brand by name or alias, created when unknown; blank clears. */
        @Size(max = 128) String brandName,
        /** NEW | MARKDOWN | USED. */
        String condition,
        /** Blank clears. */
        @Size(max = 255) String conditionNote,
        /** Characteristics (replaces the stored ones); validated against the category schema. */
        Map<String, Object> specs,
        /** DRAFT | AI_FILLED | READY — the admin may set it by hand. */
        String cardStatus) {

    /**
     * @param id existing variant id, when the client is editing a variant that already exists.
     *           Sending it lets the server keep the row (and its id) instead of deleting and
     *           recreating it — regenerated ids used to break carts and order history that point
     *           at the old variant.
     */
    public record VariantInput(
            String id,
            @NotBlank @Size(max = 128) String name,
            /** {@code null} = keep the stored value (0 for a new variant). */
            @PositiveOrZero Integer stock,
            /** See {@link ProductUpsertRequest#expectedStock()}. */
            @PositiveOrZero Integer expectedStock) {
    }
}
