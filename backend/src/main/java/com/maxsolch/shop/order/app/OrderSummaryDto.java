package com.maxsolch.shop.order.app;

import io.swagger.v3.oas.annotations.media.Schema;
import org.springframework.lang.Nullable;

import java.time.Instant;

@lombok.Builder
public record OrderSummaryDto(
        String id,
        @Schema(implementation = com.maxsolch.shop.order.domain.OrderStatus.class) String status,
        long totalMinor,
        String currency,
        Instant createdAt,
        int itemsCount,
        long unreadCount,
        boolean paid,
        /** Amount received (online payments + admin-recorded). */
        long receivedMinor,
        /** Deadline to pay online; null for orders placed before online payment existed. */
        @Nullable Instant paymentDueAt,
        /** Still to pay online right now (0 once the online part — whole order or prepayment — is covered). */
        long amountDueMinor,
        /** PENDING | APPROVED | DECLINED — my cancellation request; null = none. */
        @Schema(implementation = com.maxsolch.shop.order.domain.CancelRequestStatus.class) @Nullable String cancelRequestStatus,
        /** Gift case (V57): null | SEALED (waits to be opened) | OPENED. */
        @Nullable String giftCaseStatus,
        boolean giftCaseOpenable,
        /** Refused at the Nova Poshta branch (partial pickup, V72): not paid for, not part of the payment state. */
        long uncollectedMinor) {
}
