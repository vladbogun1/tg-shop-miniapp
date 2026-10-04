package com.maxsolch.shop.web.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * Start a broadcast. {@code audience} = all | active | inactive | premium.
 *
 * <p>{@code lang} (uk/ru/en, optional) narrows the audience to customers reading the shop in that
 * language (users.locale, else their Telegram language, else Ukrainian). {@code textUk/Ru/En}
 * (optional) are per-language versions; a customer whose version is empty gets {@code text}.
 */
public record BroadcastRequest(
        /** Telegram refuses anything longer than 4096 characters. */
        @NotBlank @Size(max = 4096) String text,
        String audience,
        boolean withButton,
        @Size(max = 64) String buttonText,
        @Pattern(regexp = "^(|uk|ru|en)$") String lang,
        @Size(max = 4096) String textUk,
        @Size(max = 4096) String textRu,
        @Size(max = 4096) String textEn) {
}
