package com.maxsolch.shop.order.app;

import io.swagger.v3.oas.annotations.media.Schema;
import org.springframework.lang.Nullable;

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
        @Schema(allowableValues = {"none", "created", "processing", "hold", "success", "failure", "reversed", "expired"}) String status,
        @Nullable String pageUrl,
        @Nullable Instant expiresAt,
        long amountMinor,
        @Nullable String maskedPan,
        @Nullable String paymentMethod,
        @Nullable String failureReason) {
}
