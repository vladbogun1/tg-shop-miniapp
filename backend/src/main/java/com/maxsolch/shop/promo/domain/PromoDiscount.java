package com.maxsolch.shop.promo.domain;

import com.maxsolch.shop.platform.util.Money;


/**
 * What a promo code takes off a cart: the one rule the checkout, the admin editing an order and the cart
 * preview all go through ({@link #apply}).
 */
public final class PromoDiscount {

    private PromoDiscount() {
    }

    /** The answer of {@link #apply}: the discount, or why the code does not apply (then the discount is 0). */
    public record Applied(long discountMinor, PromoRejection rejection) {
        public boolean rejected() {
            return rejection != null;
        }
    }

    /**
     * Apply a code to a cart worth {@code subtotal} of which {@code excludedMinor} are low-margin products no
     * promo code applies to. A cart of only such products is refused, so a use of the code is not wasted.
     * Otherwise see {@link #discountFor(PromoCode, long, long)} for the arithmetic.
     */
    public static Applied apply(PromoCode promo, long subtotal, long excludedMinor) {
        if (excludedMinor > 0 && subtotal - excludedMinor <= 0) {
            return new Applied(0, PromoRejection.CASE_EXCLUDED);
        }
        return new Applied(discountFor(promo, subtotal, excludedMinor), null);
    }

    /**
     * Discount for a promo code against a subtotal. Fixed amount wins over percent, and both are
     * capped at the subtotal so a misconfigured code (say 150%) can never produce a negative total
     * or a stored discount larger than the order itself.
     */
    public static long discountFor(PromoCode promo, long subtotal) {
        return discountFor(promo, subtotal, 0);
    }

    /**
     * The same against the subtotal without {@code excludedMinor} (the low-margin products no promo code
     * applies to); capped at what is left. Order: the excluded products come off
     * first, then the percent (or amount), then the code's own ceiling ({@code max_discount_minor}, V63).
     */
    public static long discountFor(PromoCode promo, long subtotal, long excludedMinor) {
        long base = Math.max(0, subtotal - Math.max(0, excludedMinor));
        long discount = discountOn(promo, base);
        return Math.min(discount, base);
    }

    private static long discountOn(PromoCode promo, long subtotal) {
        long discount = switch (promo.kind()) {
            case FIXED -> promo.getDiscountAmountMinor();
            case PERCENT -> Money.percentOf(subtotal, Math.min(100, promo.getDiscountPercent()));
            case NONE -> 0;
        };
        if (promo.getMaxDiscountMinor() > 0) {
            discount = Math.min(discount, promo.getMaxDiscountMinor());
        }
        return Math.min(Math.max(0, discount), subtotal);
    }
}
