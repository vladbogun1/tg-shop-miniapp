package com.maxsolch.shop.web.dto;

public record AdminPaymentOptionDto(
        String id,
        String title,
        String description,
        boolean requiresPrepayment,
        long prepaymentMinor,
        int sortOrder,
        /** Nullable: when the admin UI omits it, the option is treated as active. */
        Boolean active) {
}
