package com.maxsolch.shop.procurement.domain.supplyai;

/**
 * "Create a new product" proposal - from the AI (step 2) or empty when the admin picked "new" by hand.
 * Same shape as NewProductDraft in frontend-admin/features/supply/model/ai/types.ts.
 *
 * @param variant variant name; lines with the same title become one product with variants
 */
public record NewProductDraft(String title, String brand, String categoryId, String variant, String source) {
}
