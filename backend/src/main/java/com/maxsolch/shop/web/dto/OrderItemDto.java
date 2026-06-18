package com.maxsolch.shop.web.dto;

public record OrderItemDto(
        String productId,
        String title,
        long priceMinor,
        String variantId,
        String variantName,
        int quantity,
        String imageUrl) {
}
