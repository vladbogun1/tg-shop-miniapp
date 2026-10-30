package com.maxsolch.shop.customer.api;

import jakarta.validation.constraints.NotBlank;

public record TelegramAuthRequest(@NotBlank String initData) {
}
