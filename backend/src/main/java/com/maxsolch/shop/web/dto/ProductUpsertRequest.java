package com.maxsolch.shop.web.dto;

import jakarta.validation.constraints.NotBlank;

import java.util.List;

public record ProductUpsertRequest(
        @NotBlank String title,
        String description,
        long priceMinor,
        String currency,
        int stock,
        Boolean active,
        List<String> imageKeys,
        List<String> tagIds,
        List<VariantInput> variants) {

    public record VariantInput(String name, int stock) {
    }
}
