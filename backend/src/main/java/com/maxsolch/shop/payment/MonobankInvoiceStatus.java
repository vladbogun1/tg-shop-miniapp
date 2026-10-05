package com.maxsolch.shop.payment;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

import java.util.List;

/**
 * Body of {@code GET /api/merchant/invoice/status} — and of the webhook, which carries the same
 * schema. Only the fields the shop uses; dates are kept as the strings monobank sends.
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public record MonobankInvoiceStatus(
        String invoiceId,
        String status,
        String failureReason,
        String errCode,
        Long amount,
        Integer ccy,
        Long finalAmount,
        String createdDate,
        String modifiedDate,
        String reference,
        PaymentInfo paymentInfo,
        List<CancelItem> cancelList) {

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record PaymentInfo(
            String maskedPan,
            String approvalCode,
            String rrn,
            String tranId,
            String paymentSystem,
            String paymentMethod,
            Long fee,
            String country) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record CancelItem(
            String status,
            Long amount,
            Integer ccy,
            String createdDate,
            String modifiedDate,
            String extRef) {
    }
}
