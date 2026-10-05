package com.maxsolch.shop.web.dto;

import java.time.Instant;

public record OrderSummaryDto(
        String id,
        String status,
        long totalMinor,
        String currency,
        Instant createdAt,
        int itemsCount,
        long unreadCount,
        boolean paid,
        /** Amount received (online payments + admin-recorded). */
        long receivedMinor,
        /** Deadline to pay online; null for orders placed before online payment existed. */
        Instant paymentDueAt,
        /** Still to pay online right now (0 once the online part — whole order or prepayment — is covered). */
        long amountDueMinor) {
}
