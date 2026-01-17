package com.example.tgshop.api.dto;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;

public record ProductVariantRequest(
    @NotBlank String name,
    @Min(0) int stock
) {}
