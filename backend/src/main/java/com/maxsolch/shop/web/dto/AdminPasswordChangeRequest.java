package com.maxsolch.shop.web.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** «Мой аккаунт» → смена пароля: current password + code from the app + the new password. */
public record AdminPasswordChangeRequest(
        @NotBlank @Size(max = 256) String currentPassword,
        @NotBlank @Size(max = 256) String newPassword,
        @NotBlank @Size(max = 16) String code) {
}
