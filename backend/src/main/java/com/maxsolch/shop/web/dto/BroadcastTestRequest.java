package com.maxsolch.shop.web.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** Send one test message. {@code telegramUserId} null = to the admin who is sending it («себе»). */
public record BroadcastTestRequest(
        @NotBlank @Size(max = 4096) String text,
        Long telegramUserId,
        boolean withButton,
        @Size(max = 64) String buttonText) {
}
