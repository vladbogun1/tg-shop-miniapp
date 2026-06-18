package com.maxsolch.shop.web.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;

import java.util.List;

public record CreateOrderRequest(
        @NotEmpty List<Item> items,
        @NotBlank String customerName,
        @NotBlank String phone,
        String comment,
        String promoCode,
        @NotNull String deliveryMethod,
        String npCityRef,
        String npCityName,
        String npWarehouseRef,
        String npWarehouseName,
        String paymentOptionId) {

    public record Item(
            @NotBlank String productId,
            String variantId,
            int quantity) {
    }
}
