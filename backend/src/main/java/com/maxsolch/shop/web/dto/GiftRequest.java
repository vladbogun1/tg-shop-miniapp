package com.maxsolch.shop.web.dto;

import jakarta.validation.constraints.NotBlank;

/** Admin adds a free gift product to an existing order. */
public record GiftRequest(
        @NotBlank String productId,
        String variantId,
        Integer quantity,
        /** DM the customer about the gift (default true). */
        Boolean notifyCustomer) {
}
