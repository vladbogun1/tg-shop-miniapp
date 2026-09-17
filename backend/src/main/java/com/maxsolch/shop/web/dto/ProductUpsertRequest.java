package com.maxsolch.shop.web.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

import java.util.List;

public record ProductUpsertRequest(
        @NotBlank @Size(max = 255) String title,
        @Size(max = 20_000) String description,
        @PositiveOrZero long priceMinor,
        @Size(max = 8) String currency,
        @PositiveOrZero int stock,
        Boolean active,
        @Size(max = 30) List<@Size(max = 2048) String> imageKeys,
        @Size(max = 50) List<String> tagIds,
        @Valid @Size(max = 100) List<VariantInput> variants) {

    /**
     * @param id existing variant id, when the client is editing a variant that already exists.
     *           Sending it lets the server keep the row (and its id) instead of deleting and
     *           recreating it — regenerated ids used to break carts and order history that point
     *           at the old variant.
     */
    public record VariantInput(
            String id,
            @NotBlank @Size(max = 128) String name,
            @PositiveOrZero int stock) {
    }
}
