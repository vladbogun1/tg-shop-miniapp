package com.maxsolch.shop.web.dto;

public record PromoCodeDto(
        String id,
        String code,
        int discountPercent,
        long discountAmountMinor,
        Integer maxUses,
        int usesCount,
        boolean active) {
}
