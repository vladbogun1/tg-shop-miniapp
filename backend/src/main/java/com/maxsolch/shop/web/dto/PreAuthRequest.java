package com.maxsolch.shop.web.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** Just the pre-auth token (2FA setup step). */
public record PreAuthRequest(@NotBlank @Size(max = 2048) String preAuthToken) {
}
