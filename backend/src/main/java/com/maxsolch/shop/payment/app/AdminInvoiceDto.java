package com.maxsolch.shop.payment.app;

import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Instant;
import org.springframework.lang.Nullable;

/** One monobank invoice of an order, for the admin order drawer. */
public record AdminInvoiceDto(
        String invoiceId,
        @Schema(allowableValues = {"none", "created", "processing", "hold", "success", "failure", "reversed", "expired"}) String status,
        long amountMinor,
        @Nullable Long finalAmountMinor,
        long refundedMinor,
        @Nullable String pageUrl,
        @Nullable Instant expiresAt,
        @Nullable String maskedPan,
        @Nullable String paymentMethod,
        @Nullable String paymentSystem,
        @Nullable String rrn,
        @Nullable String approvalCode,
        @Nullable Long feeMinor,
        @Nullable String failureReason,
        @Nullable String errCode,
        @Nullable Instant appliedAt,
        boolean refundPending,
        Instant createdAt,
        Instant updatedAt) {
}
