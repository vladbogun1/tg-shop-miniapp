package com.maxsolch.shop.web.dto;

import jakarta.validation.constraints.NotBlank;

public record TagUpsertRequest(@NotBlank String name) {
}
