package com.maxsolch.shop.order.app;

import io.swagger.v3.oas.annotations.media.Schema;
import org.springframework.lang.Nullable;

import java.time.Instant;
import java.util.List;

/**
 * Seller dispatch row for an APPROVED order: what to ship, where, and how much
 * cash-on-delivery (наложка) to set, accounting for prepayment / full payment.
 *   receivedMinor = already paid (prepayment, or full when paid)
 *   codMinor      = total - received → the amount to collect at Nova Poshta
 */
@lombok.Builder
public record DispatchOrderDto(
        String id,
        String shortId,
        String customerName,
        String phone,
        @Schema(implementation = com.maxsolch.shop.order.domain.DeliveryMethod.class) @Nullable String deliveryMethod,
        @Nullable String npCityName,
        @Nullable String npWarehouseName,
        List<DispatchItem> items,
        long totalMinor,
        long prepaymentMinor,
        long receivedMinor,
        long codMinor,
        boolean paid,
        String currency,
        @Nullable String paymentOptionTitle,
        @Nullable String trackingNumber,
        Instant createdAt,
        @Nullable Instant approvedAt,
        /** APPROVED, or NEW when the list includes not-yet-approved orders (NEW → SHIPPED is allowed). */
        @Schema(implementation = com.maxsolch.shop.order.domain.OrderStatus.class) String status,
        /** Pay online by then or the order is cancelled; null = placed before online payment. */
        @Nullable Instant paymentDueAt,
        /** Still to pay online now; 0 = nothing to pay. */
        long amountDueMinor) {

    /** {@code imageUrl}: the product's first photo, null when it has none or the product is gone. */
    public record DispatchItem(String title, @Nullable String variantName, int quantity, long priceMinor, @Nullable String imageUrl) {
    }
}
