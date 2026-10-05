package com.maxsolch.shop.web.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** Second sign-in step: the pre-auth token, the 6-digit code and «Доверять этому устройству». */
public record TwoFactorRequest(
        @NotBlank @Size(max = 2048) String preAuthToken,
        @Size(max = 16) String code,
        boolean trustDevice) {
}
