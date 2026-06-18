package com.maxsolch.shop.web.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

/** Send one test message to a specific Telegram user id. */
public record BroadcastTestRequest(
        @NotBlank String text,
        @NotNull Long telegramUserId,
        boolean withButton,
        String buttonText) {
}
