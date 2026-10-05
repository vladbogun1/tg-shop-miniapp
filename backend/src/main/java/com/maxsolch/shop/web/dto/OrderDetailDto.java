package com.maxsolch.shop.web.dto;

import java.time.Instant;
import java.util.List;

public record OrderDetailDto(
        String id,
        String status,
        long subtotalMinor,
        long discountMinor,
        long totalMinor,
        String currency,
        String customerName,
        String phone,
        String comment,
        String promoCode,
        String deliveryMethod,
        String npCityName,
        String npWarehouseName,
        String paymentOptionTitle,
        String trackingNumber,
        String rejectReason,
        List<OrderItemDto> items,
        /** Online payment (monobank) state — latest invoice; never null. */
        OnlinePaymentDto payment,
        Long tgUserId,
        String tgUsername,
        Instant createdAt,
        Instant approvedAt,
        Instant shippedAt,
        Instant deliveredAt,
        Instant rejectedAt,
        boolean paid,
        Instant paidAt,
        long prepaymentMinor,
        long receivedMinor,
        /** Pay online by then or the order is cancelled; null = order placed before online payment. */
        Instant paymentDueAt,
        /** Still to pay online now (prepayment or total minus what arrived); 0 = nothing to pay. */
        long amountDueMinor,
        /** MINIAPP | WEB | ADMIN — where the order was placed. */
        String source,
        /** uk | ru | en chosen by the customer in the shop (users.locale); null = never chose. */
        String customerLocale,
        /** RejectReasonCode name, null = not specified. */
        String rejectReasonCode,
        /** Money given back to the customer (returns). */
        long refundedMinor,
        Instant returnedAt,
        /** Nova Poshta refs — the admin's delivery editor needs them to keep the address valid. */
        String npCityRef,
        String npWarehouseRef) {
}
