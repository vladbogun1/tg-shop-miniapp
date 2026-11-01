package com.maxsolch.shop.promo.api;

import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Instant;
import org.springframework.lang.Nullable;

public record PromoCodeDto(
        String id,
        String code,
        int discountPercent,
        long discountAmountMinor,
        /** Ceiling of the discount in kopecks (V63); 0 = none. */
        long maxDiscountMinor,
        @Nullable Integer maxUses,
        int usesCount,
        boolean active,
        /**
         * Live 30-minute holds of customers with the code in their cart (Р11): with a limit, these
         * slots are taken too, so "2/3 + резерв 1" explains why the next customer is refused.
         */
        long reservedCount,
        /** Personal code (V44): the only customer allowed to use it; null = anyone. */
        @Nullable Long ownerUserId,
        /** Last moment the code is valid (V44); null = no expiry. */
        @Nullable Instant expiresAt,
        /** {@code REVIEW_BONUS} for a review bonus; null = made by an admin. */
        @Nullable @Schema(allowableValues = {"REVIEW_BONUS"}) String source,
        /** {@code OURS} | {@code PERSONAL} | {@code REVIEW} — see {@link com.maxsolch.shop.promo.domain.PromoOrigin}. */
        @Schema(allowableValues = {"OURS", "PERSONAL", "REVIEW"}) String origin) {
}
