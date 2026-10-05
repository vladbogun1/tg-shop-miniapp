package com.maxsolch.shop.web.dto;

import java.time.Instant;
import java.util.List;

/**
 * Public product representation. Ids are UUID strings, money in minor units.
 *
 * <p>The fields after {@code tags} were added for the public site (slug URLs, struck-through
 * "old" price, SEO overrides, "new arrivals" sort, brand/SKU for schema.org). The Mini App ignores them.
 */
public record ProductDto(
        String id,
        String title,
        String description,
        long priceMinor,
        String currency,
        int stock,
        boolean active,
        long soldCount,
        List<ProductImageDto> images,
        List<ProductVariantDto> variants,
        List<TagDto> tags,
        String slug,
        Long compareAtMinor,
        String seoTitle,
        String seoDescription,
        Instant createdAt,
        /** Brand for schema.org (V36, not translated); null = the site's heuristic. */
        String brand,
        /** Article number (V36); null = the site uses the id. */
        String sku) {

    /** Units actually available: the variant sum when there are variants, else the product stock. */
    public int effectiveStock() {
        if (variants != null && !variants.isEmpty()) {
            int sum = 0;
            for (ProductVariantDto v : variants) {
                sum += Math.max(0, v.stock());
            }
            return sum;
        }
        return Math.max(0, stock);
    }
}
