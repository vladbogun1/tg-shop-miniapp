package com.maxsolch.shop.web.dto;

public record AuthUserDto(
        long userId,
        String username,
        String firstName,
        String lastName,
        boolean admin) {
}
