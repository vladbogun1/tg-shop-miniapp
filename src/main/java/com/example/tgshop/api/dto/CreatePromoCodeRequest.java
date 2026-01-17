package com.example.tgshop.api.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;

public record CreatePromoCodeRequest(
    @NotBlank String code,
    @Min(0) @Max(100) int discountPercent,
    @Min(0) long discountAmountMinor,
    Integer maxUses,
    boolean active
) {}
