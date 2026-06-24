package com.maxsolch.shop.web.dto;

import java.time.Instant;
import java.util.List;

/**
 * Seller dispatch row for an APPROVED order: what to ship, where, and how much
 * cash-on-delivery (наложка) to set, accounting for prepayment / full payment.
 *   receivedMinor = already paid (prepayment, or full when paid)
 *   codMinor      = total - received → the amount to collect at Nova Poshta
 */
public record DispatchOrderDto(
        String id,
        String shortId,
        String customerName,
        String phone,
        String deliveryMethod,
        String npCityName,
        String npWarehouseName,
        List<DispatchItem> items,
        long totalMinor,
        long prepaymentMinor,
        long receivedMinor,
        long codMinor,
        boolean paid,
        String currency,
        String paymentOptionTitle,
        String trackingNumber,
        Instant createdAt,
        Instant approvedAt) {

    public record DispatchItem(String title, String variantName, int quantity, long priceMinor) {
    }
}
