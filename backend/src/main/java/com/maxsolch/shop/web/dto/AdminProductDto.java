package com.maxsolch.shop.web.dto;

import java.util.List;

public record AdminProductDto(
        String id,
        String title,
        String description,
        long priceMinor,
        String currency,
        int stock,
        boolean active,
        boolean archived,
        List<ProductImageDto> images,
        List<ProductVariantDto> variants,
        List<TagDto> tags) {
}
