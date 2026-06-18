package com.maxsolch.shop.web.dto;

public record AdminPaymentOptionDto(
        String id,
        String title,
        String description,
        boolean requiresPrepayment,
        long prepaymentMinor,
        int sortOrder,
        boolean active) {
}
