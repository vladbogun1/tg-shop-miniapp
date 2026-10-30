package com.maxsolch.shop.customer.app;

public record MeProfileDto(
        long userId,
        String username,
        String firstName,
        String lastName,
        boolean admin) {
}
