package com.maxsolch.shop.payment.app;

public record PaymentOptionDto(
        String id,
        String title,
        String description,
        boolean requiresPrepayment,
        long prepaymentMinor) {
}
