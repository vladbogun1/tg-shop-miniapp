package com.maxsolch.shop.web.dto;

import java.time.Instant;

public record OrderCardDto(
        String id,
        String customerName,
        long totalMinor,
        String currency,
        int itemsCount,
        String deliveryMethod,
        String paymentOptionTitle,
        long unreadCount,
        Instant createdAt,
        String status) {
}
