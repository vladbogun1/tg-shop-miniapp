package com.maxsolch.shop.web.dto;

import jakarta.validation.constraints.NotBlank;

public record UpdateOrderStatusRequest(
        @NotBlank String status,
        String trackingNumber,
        String rejectReason,
        /** For REJECTED: return items to stock? null = true (default). */
        Boolean restock) {
}
