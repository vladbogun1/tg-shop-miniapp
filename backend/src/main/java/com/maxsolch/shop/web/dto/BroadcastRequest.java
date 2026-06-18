package com.maxsolch.shop.web.dto;

import jakarta.validation.constraints.NotBlank;

/** Start a broadcast. {@code audience} = all | active | inactive | premium. */
public record BroadcastRequest(
        @NotBlank String text,
        String audience) {
}
