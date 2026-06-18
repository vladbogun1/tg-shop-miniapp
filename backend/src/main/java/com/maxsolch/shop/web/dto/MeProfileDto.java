package com.maxsolch.shop.web.dto;

public record MeProfileDto(
        long userId,
        String username,
        String firstName,
        String lastName,
        boolean admin) {
}
