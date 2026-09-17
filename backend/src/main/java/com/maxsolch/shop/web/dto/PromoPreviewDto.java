package com.maxsolch.shop.web.dto;

/**
 * What a promo code is worth for a given cart, so the checkout can show the real total before the
 * order is placed instead of "скидка применится на сервере" and a surprise afterwards.
 *
 * @param valid          whether the code exists, is active and still has uses left
 * @param discountMinor  the discount that would be applied to this subtotal
 * @param totalMinor     subtotal minus the discount
 * @param message        why it is not applicable, when {@code valid} is false
 */
public record PromoPreviewDto(boolean valid, long discountMinor, long totalMinor, String message) {
}
