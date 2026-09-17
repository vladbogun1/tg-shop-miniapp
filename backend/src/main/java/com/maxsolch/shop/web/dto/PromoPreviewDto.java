package com.maxsolch.shop.web.dto;

import java.time.Instant;

/**
 * What a promo code is worth for a given cart, so the CART (not only the last checkout step) can
 * show the real total and say straight away when a code is not going to work.
 *
 * @param valid          whether the code exists, is active and still has uses left for this customer
 * @param discountMinor  the discount that would be applied to this subtotal
 * @param totalMinor     subtotal minus the discount
 * @param message        why it is not applicable, when {@code valid} is false
 * @param reservedUntil  when this customer's hold on a limited code runs out; null when the code is
 *                       unlimited (nothing to hold) or this was a read-only preview
 */
public record PromoPreviewDto(boolean valid,
                              long discountMinor,
                              long totalMinor,
                              String message,
                              Instant reservedUntil) {
}
