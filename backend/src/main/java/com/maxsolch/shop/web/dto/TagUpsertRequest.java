package com.maxsolch.shop.web.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Create / edit a tag. Everything but {@code name} is optional: an absent field keeps the current
 * value (older admin builds send only the name), a blank {@code slug} regenerates it from the name.
 */
public record TagUpsertRequest(
        @NotBlank @Size(max = 128) String name,
        @Size(max = 160) String slug,
        Integer sortOrder,
        Boolean showInMenu) {
}
