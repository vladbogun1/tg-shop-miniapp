package com.maxsolch.shop.web.dto;

import jakarta.validation.constraints.NotBlank;

/** Admin browser login (username + password). */
public record AdminLoginRequest(
        @NotBlank String username,
        @NotBlank String password) {
}
