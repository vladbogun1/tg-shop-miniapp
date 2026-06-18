package com.maxsolch.shop.web.dto;

import jakarta.validation.constraints.NotBlank;

public record UpdateOrderStatusRequest(
        @NotBlank String status,
        String trackingNumber,
        String rejectReason) {
}
