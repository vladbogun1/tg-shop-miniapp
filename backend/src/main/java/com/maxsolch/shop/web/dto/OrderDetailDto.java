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
        PaymentRequisitesDto requisites,
        Long tgUserId,
        String tgUsername,
        Instant createdAt,
        Instant approvedAt,
        Instant shippedAt,
        Instant deliveredAt,
        Instant rejectedAt,
        boolean paid,
        Instant paidAt) {
}
