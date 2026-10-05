package com.maxsolch.shop.web.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

/**
 * Answer of every admin sign-in step.
 *
 * @param status       {@code OK} (accessToken set), {@code TOTP_REQUIRED} or {@code SETUP_REQUIRED}
 *                     (preAuthToken set — the second step needs it)
 * @param accessToken  ADMIN JWT, only when {@code OK}
 * @param preAuthToken 5-minute token for {@code /api/auth/admin/2fa/*}; grants nothing else
 * @param name         the admin's display name, for the greeting on the code screen
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record AdminLoginResponse(String status, String accessToken, String preAuthToken, String name) {
}
