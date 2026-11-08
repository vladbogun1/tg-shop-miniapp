package com.maxsolch.shop.procurement.domain.supplyai;

import java.util.List;

/**
 * A catalog product as matching sees it. Same shape as CatalogItem in
 * frontend-admin/features/supply/model/ai/types.ts. All ids are strings.
 *
 * @param hidden not on the shop window (a product a draft created, or one taken off sale) — still ours to match
 */
public record CatalogItem(
        String id,
        String title,
        String brand,
        String categoryId,
        List<Variant> variants,
        String imageUrl,
        boolean hidden) {

    public CatalogItem {
        variants = variants == null ? List.of() : variants;
    }

    public CatalogItem(String id, String title, String brand, String categoryId, List<Variant> variants, String imageUrl) {
        this(id, title, brand, categoryId, variants, imageUrl, false);
    }

    public record Variant(String id, String name) {
    }
}
