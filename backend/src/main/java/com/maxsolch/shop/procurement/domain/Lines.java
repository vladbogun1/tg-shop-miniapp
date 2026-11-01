package com.maxsolch.shop.procurement.domain;

import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.catalog.domain.Product;
import com.maxsolch.shop.catalog.domain.ProductVariant;
import com.maxsolch.shop.platform.util.UuidUtil;


/** A "line" is a product or one of its variants — what a batch brings and what a queue waits for. */
public final class Lines {

    private Lines() {
    }

    /** Stable key of a line: {@code productId:variantId} (variant part empty for a plain product). */
    public static String key(byte[] productId, byte[] variantId) {
        return com.maxsolch.shop.catalog.domain.LineKey.of(productId, variantId);
    }

    /** A UUID text from a request as bytes; a blank or malformed one is a 400. */
    public static byte[] bytes(String uuid) {
        if (uuid == null || uuid.isBlank()) {
            throw new DomainException.BadRequest(ProcurementError.PRODUCT_ID_REQUIRED);
        }
        try {
            return UuidUtil.toBytes(uuid.trim());
        } catch (IllegalArgumentException e) {
            throw new DomainException.BadRequest(ProcurementError.INVALID_ID, uuid);
        }
    }

    /** Units on the shelf: of the variant when there is one, else of the product. */
    public static int stockOf(Product p, ProductVariant v) {
        return v != null ? v.getStock() : p.getStock();
    }
}
