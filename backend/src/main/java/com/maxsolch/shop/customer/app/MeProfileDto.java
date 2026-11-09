package com.maxsolch.shop.customer.app;

public record MeProfileDto(
        long userId,
        String username,
        String firstName,
        String lastName,
        boolean admin,
        /** Checkout offers only full online payment (the admin marked the buyer «проблемный»; no reason is told). */
        boolean onlinePaymentOnly) {
}
