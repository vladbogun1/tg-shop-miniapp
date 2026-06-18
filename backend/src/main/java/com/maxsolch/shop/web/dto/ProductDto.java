package com.maxsolch.shop.web.dto;

import java.util.List;

/**
 * Public product representation. Ids are UUID strings, money in minor units.
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
        List<TagDto> tags) {
}
