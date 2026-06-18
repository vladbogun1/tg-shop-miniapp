package com.maxsolch.shop.web.dto;

public record PaymentOptionDto(
        String id,
        String title,
        String description,
        boolean requiresPrepayment,
        long prepaymentMinor) {
}
