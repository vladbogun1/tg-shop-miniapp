package com.maxsolch.shop.web.dto;

public record OrderItemDto(
        Long id,
        String productId,
        String title,
        long priceMinor,
        String variantId,
        String variantName,
        int quantity,
        String imageUrl,
        boolean gift) {
}
