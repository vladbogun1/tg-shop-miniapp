package com.maxsolch.shop.staff.api;

import jakarta.validation.constraints.NotBlank;

/** The first factor of the admin sign-in: the Telegram initData (same body as the customer login). */
public record AdminTelegramAuthRequest(@NotBlank String initData) {
}
