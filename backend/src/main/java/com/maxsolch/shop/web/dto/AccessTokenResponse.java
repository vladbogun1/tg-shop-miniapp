package com.maxsolch.shop.web.dto;

/** A replacement access token for the calling device (after password change / 2FA re-setup). */
public record AccessTokenResponse(String accessToken) {
}
