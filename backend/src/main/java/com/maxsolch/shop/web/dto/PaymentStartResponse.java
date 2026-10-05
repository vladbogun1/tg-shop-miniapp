package com.maxsolch.shop.web.dto;

import java.time.Instant;

/** A monobank payment page for the order: send the customer to {@code pageUrl}. */
public record PaymentStartResponse(String invoiceId, String pageUrl, long amountMinor, Instant expiresAt) {
}
