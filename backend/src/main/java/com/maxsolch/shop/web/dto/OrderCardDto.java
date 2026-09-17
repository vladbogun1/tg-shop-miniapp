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
        String status,
        boolean paid,
        /** Customer claims they paid (screenshot uploaded) but no admin confirmed it yet. */
        boolean paymentClaimed,
        /** Confirmed amount received, so the card can tell a partial payment from a full one. */
        long receivedMinor) {
}
