package com.maxsolch.shop.domain;

/**
 * Where a promo code came from — the tabs of the «Промокоды» page and the filter of the order's
 * «Скидка» picker. Derived from existing columns, no own column:
 * <ul>
 *   <li>{@link #REVIEW} — {@code source = REVIEW_BONUS}: issued automatically for a review (V49);</li>
 *   <li>{@link #PERSONAL} — any other code with an {@code owner_user_id}: meant for one customer;</li>
 *   <li>{@link #OURS} — no source, no owner: a shared code an admin made on the «Промокоды» page.</li>
 * </ul>
 * A manual order discount (amount/percent in the order's «Скидка») is not a promo code at all: it
 * lives only in {@code orders.promo_code} as a label starting with {@link #MANUAL_DISCOUNT_LABEL}.
 */
public enum PromoOrigin {
    OURS, PERSONAL, REVIEW;

    /** Prefix of {@code orders.promo_code} written by an admin's manual amount/percent discount. */
    public static final String MANUAL_DISCOUNT_LABEL = "Ручная скидка";

    public static PromoOrigin of(String source, Long ownerUserId) {
        if (PromoCode.SOURCE_REVIEW_BONUS.equals(source)) {
            return REVIEW;
        }
        if (ownerUserId != null || source != null) {
            // An unknown future source is a generated code too — never mix it into «Наши».
            return PERSONAL;
        }
        return OURS;
    }

    public static PromoOrigin of(PromoCode p) {
        return of(p.getSource(), p.getOwnerUserId());
    }

    /** "ours" / "OURS" → OURS; null/blank → null (no filter); anything else → IllegalArgumentException. */
    public static PromoOrigin parse(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        return valueOf(value.trim().toUpperCase(java.util.Locale.ROOT));
    }
}
