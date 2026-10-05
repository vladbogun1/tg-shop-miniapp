package com.maxsolch.shop.web.dto;

import java.time.Instant;

/**
 * Online payment state of an order for the customer apps (latest monobank invoice).
 *
 * @param enabled       online payment is configured on this server (token set)
 * @param status        latest invoice: none | created | processing | hold | success | failure | reversed | expired
 * @param pageUrl       live payment page to send the customer to (only while it can be paid)
 * @param expiresAt     when that page stops accepting payment
 * @param amountMinor   amount of the latest invoice
 * @param maskedPan     card used, e.g. 444403******1902
 * @param paymentMethod pan | apple | google | monobank | wallet | direct
 * @param failureReason bank's text for a failed attempt
 */
public record OnlinePaymentDto(
        boolean enabled,
        String status,
        String pageUrl,
        Instant expiresAt,
        long amountMinor,
        String maskedPan,
        String paymentMethod,
        String failureReason) {
}
