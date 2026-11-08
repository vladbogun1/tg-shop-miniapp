package com.maxsolch.shop.procurement.domain.supplyai;

/** Supplier memory pair: line key to product. Same as Alias in frontend-admin/features/supply/model/ai/match.ts. */
public record SupplierAlias(String sourceKey, String productId, String variantId) {
}
