package com.maxsolch.shop.payment.app;

import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Instant;

/** One monobank invoice of an order, for the admin order drawer. */
public record AdminInvoiceDto(
        String invoiceId,
        @Schema(allowableValues = {"none", "created", "processing", "hold", "success", "failure", "reversed", "expired"}) String status,
        long amountMinor,
        Long finalAmountMinor,
        long refundedMinor,
        String pageUrl,
        Instant expiresAt,
        String maskedPan,
        String paymentMethod,
        String paymentSystem,
        String rrn,
        String approvalCode,
        Long feeMinor,
        String failureReason,
        String errCode,
        Instant appliedAt,
        boolean refundPending,
        Instant createdAt,
        Instant updatedAt) {
}
