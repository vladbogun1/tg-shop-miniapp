package com.maxsolch.shop.web.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

import java.time.Instant;

/** Request/response shapes of the public site's bot login ({@code /api/auth/web/**}) and sessions. */
public final class WebAuthDtos {

    private WebAuthDtos() {
    }

    /** {@code deepLink} opens the bot; {@code matchCode} is the number the user must pick there. */
    public record StartResponse(String loginId, String deepLink, int matchCode, Instant expiresAt) {
    }

    public record StatusResponse(String status) {
    }

    public record CompleteRequest(@NotBlank String loginId) {
    }

    public record DevLoginRequest(@NotNull @Positive Long telegramUserId) {
    }

    /** Body of a successful complete / refresh: the tokens themselves travel only in cookies. */
    public record WebAuthResponse(AuthUserDto user) {
    }

    public record WebSessionDto(String id, String userAgent, String ip, Instant createdAt,
                                Instant lastUsedAt, boolean current) {
    }
}
