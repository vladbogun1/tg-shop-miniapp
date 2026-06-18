package com.maxsolch.shop.web.dto;

import jakarta.validation.constraints.NotBlank;

public record PromoCodeUpsertRequest(
        @NotBlank String code,
        int discountPercent,
        long discountAmountMinor,
        Integer maxUses,
        Boolean active) {
}
