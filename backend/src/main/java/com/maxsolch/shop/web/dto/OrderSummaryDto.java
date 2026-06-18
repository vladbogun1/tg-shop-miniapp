package com.maxsolch.shop.web.dto;

import java.time.Instant;

public record OrderSummaryDto(
        String id,
        String status,
        long totalMinor,
        String currency,
        Instant createdAt,
        int itemsCount,
        long unreadCount) {
}
