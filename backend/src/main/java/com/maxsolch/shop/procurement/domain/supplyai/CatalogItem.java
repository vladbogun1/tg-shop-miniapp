package com.maxsolch.shop.procurement.domain.supplyai;

import java.util.List;

/**
 * A catalog product as matching sees it. Same shape as CatalogItem in
 * frontend-admin/features/supply/model/ai/types.ts. All ids are strings.
 */
public record CatalogItem(
        String id,
        String title,
        String brand,
        String categoryId,
        List<Variant> variants,
        String imageUrl) {

    public CatalogItem {
        variants = variants == null ? List.of() : variants;
    }

    public record Variant(String id, String name) {
    }
}
