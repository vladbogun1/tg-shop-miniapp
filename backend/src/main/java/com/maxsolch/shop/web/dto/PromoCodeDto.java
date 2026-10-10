package com.maxsolch.shop.web.dto;

import java.time.Instant;

public record PromoCodeDto(
        String id,
        String code,
        int discountPercent,
        long discountAmountMinor,
        Integer maxUses,
        int usesCount,
        boolean active,
        /**
         * Live 30-minute holds of customers with the code in their cart (Р11): with a limit, these
         * slots are taken too, so "2/3 + резерв 1" explains why the next customer is refused.
         */
        long reservedCount,
        /** Personal code (V44): the only customer allowed to use it; null = anyone. */
        Long ownerUserId,
        /** Last moment the code is valid (V44); null = no expiry. */
        Instant expiresAt,
        /** {@code REVIEW_BONUS} for a review bonus; null = made by an admin. */
        String source,
        /** {@code OURS} | {@code PERSONAL} | {@code REVIEW} — see {@link com.maxsolch.shop.domain.PromoOrigin}. */
        String origin) {

    /** An order placed with the code (the «Заказы с кодом» list). */
    public record PromoOrderDto(
            String id,
            String status,
            String customerName,
            long totalMinor,
            long discountMinor,
            Instant createdAt) {
    }

    /** An order with a manual amount/percent discount (the «Персональные скидки» tab). */
    public record ManualDiscountDto(
            String id,
            String status,
            String customerName,
            Long tgUserId,
            /** The label as stored: «Ручная скидка» or «Ручная скидка 10%». */
            String label,
            long totalMinor,
            long discountMinor,
            Instant createdAt) {
    }
}
