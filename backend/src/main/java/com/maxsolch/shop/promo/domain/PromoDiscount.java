package com.maxsolch.shop.promo.domain;


/** What a promo code takes off an order subtotal. */
public final class PromoDiscount {

    private PromoDiscount() {
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
        long discount;
        if (promo.getDiscountAmountMinor() > 0) {
            discount = promo.getDiscountAmountMinor();
        } else if (promo.getDiscountPercent() > 0) {
            int percent = Math.min(100, promo.getDiscountPercent());
            discount = subtotal * percent / 100;
        } else {
            discount = 0;
        }
        if (promo.getMaxDiscountMinor() > 0) {
            discount = Math.min(discount, promo.getMaxDiscountMinor());
        }
        return Math.min(Math.max(0, discount), subtotal);
    }
}
