package com.maxsolch.shop.procurement.domain;

import com.maxsolch.shop.catalog.domain.Product;
import com.maxsolch.shop.catalog.domain.ProductImage;
import com.maxsolch.shop.catalog.domain.ProductVariant;
import com.maxsolch.shop.platform.util.UuidUtil;

import java.util.Arrays;
import java.util.Comparator;

/** A "line" is a product or one of its variants — what a batch brings and what a queue waits for. */
public final class Lines {

    private Lines() {
    }

    /** Stable key of a line: {@code productId:variantId} (variant part empty for a plain product). */
    public static String key(byte[] productId, byte[] variantId) {
        return UuidUtil.toString(productId) + ":" + (variantId == null ? "" : UuidUtil.toString(variantId));
    }

    /** A UUID text from a request as bytes; a blank or malformed one is a 400. */
    public static byte[] bytes(String uuid) {
        if (uuid == null || uuid.isBlank()) {
            throw ProcurementErrors.badRequest("productId обязателен");
        }
        try {
            return UuidUtil.toBytes(uuid.trim());
        } catch (IllegalArgumentException e) {
            throw ProcurementErrors.badRequest("Неверный id: " + uuid);
        }
    }

    /** Units on the shelf: of the variant when there is one, else of the product. */
    public static int stockOf(Product p, ProductVariant v) {
        return v != null ? v.getStock() : p.getStock();
    }

    /** The variant of {@code p} with this id, or null (also for a null id or a product without variants). */
    public static ProductVariant variantById(Product p, byte[] variantId) {
        if (variantId == null || p.getVariants() == null) {
            return null;
        }
        return p.getVariants().stream().filter(v -> Arrays.equals(v.getId(), variantId)).findFirst().orElse(null);
    }

    /** The first picture of the product, or null. */
    public static String imageOf(Product p) {
        if (p.getImages() == null) {
            return null;
        }
        return p.getImages().stream()
                .min(Comparator.comparingInt(ProductImage::getSortOrder))
                .map(ProductImage::getUrl)
                .orElse(null);
    }
}
