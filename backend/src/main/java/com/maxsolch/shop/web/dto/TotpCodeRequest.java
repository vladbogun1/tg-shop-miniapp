package com.maxsolch.shop.web.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** A 6-digit code from the authenticator app. */
public record TotpCodeRequest(@NotBlank @Size(max = 16) String code) {
}
