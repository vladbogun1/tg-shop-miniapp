package com.maxsolch.shop.web.dto;

import java.time.Instant;

/**
 * One payment receipt of an order ({@code GET /api/me/orders/{id}/receipts}, the admin twin).
 *
 * @param key         stable React key: {@code fiscal:<checkId>} / {@code bank:<invoice row id>}
 * @param kind        FISCAL_SALE | FISCAL_RETURN | BANK
 * @param status      PENDING (being issued) | READY | FAILED
 * @param statusText  monobank's statusDescription, when it said anything
 * @param taxUrl      the check on the tax service (ДПС) site; fiscal checks only
 * @param createdAt   when the payment was credited (bank receipt); null for fiscal checks
 * @param amountMinor the payment the receipt is for (sale / bank); null for a return
 * @param downloadUrl short-lived signed relative link to the PDF; null until READY
 */
public record ReceiptDto(String key, String kind, String status, String statusText, String taxUrl,
                         Instant createdAt, Long amountMinor, String downloadUrl) {
}
