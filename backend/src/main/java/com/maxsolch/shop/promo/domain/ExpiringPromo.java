package com.maxsolch.shop.promo.domain;

import java.time.Instant;

/** An unused, still valid promo code that runs out soon: what a reminder about it needs to know. */
public record ExpiringPromo(byte[] promoId, String code, int percent, long amountMinor, long maxDiscountMinor,
                            Long ownerUserId, byte[] sourceOrderId, Instant expiresAt) {
}
