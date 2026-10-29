package com.maxsolch.shop.order.app;

import java.time.Instant;

@lombok.Builder
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
        long amountDueMinor,
        /** PENDING | APPROVED | DECLINED — my cancellation request; null = none. */
        String cancelRequestStatus,
        /** Gift case (V57): null | SEALED (waits to be opened) | OPENED. */
        String giftCaseStatus,
        boolean giftCaseOpenable,
        /** Refused at the Nova Poshta branch (partial pickup, V72): not paid for, not part of the payment state. */
        long uncollectedMinor) {
}
