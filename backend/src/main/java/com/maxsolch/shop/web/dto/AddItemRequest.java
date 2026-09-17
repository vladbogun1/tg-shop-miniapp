package com.maxsolch.shop.web.dto;

import jakarta.validation.constraints.NotBlank;

/** Admin adds a product line to an existing order (paid line, or gift when gift=true). */
public record AddItemRequest(
        @NotBlank String productId,
        String variantId,
        Integer quantity,
        Boolean gift,
        /** DM the customer about the change (default true). */
        Boolean notifyCustomer) {
}
