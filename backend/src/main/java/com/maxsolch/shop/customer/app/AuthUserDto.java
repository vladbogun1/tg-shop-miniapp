package com.maxsolch.shop.customer.app;

public record AuthUserDto(
        long userId,
        String username,
        String firstName,
        String lastName,
        boolean admin) {
}
