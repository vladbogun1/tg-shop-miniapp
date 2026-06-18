package com.maxsolch.shop.web.dto;

import jakarta.validation.constraints.NotBlank;

public record TelegramAuthRequest(@NotBlank String initData) {
}
