package com.maxsolch.shop.web.dto;

/**
 * Customer auth response. {@code user} is null for admin-only auth.
 */
public record AuthResponse(String accessToken, AuthUserDto user) {

    public static AuthResponse of(String accessToken, AuthUserDto user) {
        return new AuthResponse(accessToken, user);
    }

    public static AuthResponse tokenOnly(String accessToken) {
        return new AuthResponse(accessToken, null);
    }
}
