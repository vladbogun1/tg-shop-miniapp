package com.example.tgshop.api.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;

public record UpdatePromoCodeRequest(
    @NotBlank String code,
    @Min(0) @Max(100) int discountPercent,
    Integer maxUses,
    boolean active
) {}
