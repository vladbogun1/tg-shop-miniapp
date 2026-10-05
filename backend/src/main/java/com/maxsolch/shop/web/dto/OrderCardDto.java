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
        /** Amount received (online payments + admin-recorded), so the card can tell a partial payment from a full one. */
        long receivedMinor,
        /** Deadline to pay online; null for orders placed before online payment existed. */
        Instant paymentDueAt,
        /** Still to pay online right now (0 once the online part — whole order or prepayment — is covered). */
        long amountDueMinor,
        /** MINIAPP | WEB | ADMIN — where the order was placed. */
        String source) {
}
