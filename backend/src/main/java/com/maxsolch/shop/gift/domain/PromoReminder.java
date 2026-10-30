package com.maxsolch.shop.gift.domain;

import java.time.Instant;

/** An unused case code that runs out soon, with the order whose chat it was announced in. */
public record PromoReminder(byte[] promoId, byte[] orderId, String code, int percent, long amountMinor,
                            Instant expiresAt) {
}
