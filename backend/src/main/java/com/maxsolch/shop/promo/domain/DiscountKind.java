package com.maxsolch.shop.promo.domain;

/**
 * How a promo code takes money off. Not stored: it is read from which of {@code discount_amount_minor} /
 * {@code discount_percent} is set (a fixed amount wins), so one place decides it, {@link PromoCode#kind()}.
 */
public enum DiscountKind {
    PERCENT,
    FIXED,
    /** A code with neither set: takes nothing off. */
    NONE
}
