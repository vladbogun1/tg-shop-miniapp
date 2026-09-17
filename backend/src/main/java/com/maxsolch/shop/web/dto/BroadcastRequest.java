package com.maxsolch.shop.web.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** Start a broadcast. {@code audience} = all | active | inactive | premium. */
public record BroadcastRequest(
        /** Telegram refuses anything longer than 4096 characters. */
        @NotBlank @Size(max = 4096) String text,
        String audience,
        boolean withButton,
        String buttonText) {
}
