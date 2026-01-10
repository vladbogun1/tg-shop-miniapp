package com.example.tgshop.api.dto;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import java.util.List;

public record CreateProductRequest(
    @NotBlank String title,
    String description,
    @Min(0) long priceMinor,
    @NotBlank String currency,
    @Min(0) int stock,
    List<@NotBlank String> imageUrls,
    boolean active
) {}
