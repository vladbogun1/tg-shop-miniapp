package com.maxsolch.shop.staff.api;

/** A replacement access token for the calling device (after password change / 2FA re-setup). */
public record AccessTokenResponse(String accessToken) {
}
