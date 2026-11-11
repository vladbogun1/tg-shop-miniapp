package com.maxsolch.shop.order.api;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.List;

public record CreateOrderRequest(
        @NotEmpty List<@Valid Item> items,
        /** Required unless {@code recipientLastName} + {@code recipientFirstName} are sent (checkout v2). */
        @Size(max = 255) String customerName,
        @NotBlank String phone,
        String comment,
        String promoCode,
        @NotNull String deliveryMethod,
        String npCityRef,
        String npCityName,
        String npWarehouseRef,
        String npWarehouseName,
        String paymentOptionId,
        /** Gift case: CASE (spin, default) | DISCOUNT (the tier's guaranteed discount instead), docs/GIFT-CASE.md. */
        String giftChoice,
        /** WAREHOUSE (default) | POSTOMAT | DOORS — checkout v2, V98. */
        @Size(max = 16) String npServiceType,
        /** Courier: street from /api/np/streets (ref may be blank when typed by hand), building, flat. */
        @Size(max = 64) String npStreetRef,
        @Size(max = 255) String npStreetName,
        @Size(max = 32) String npBuilding,
        @Size(max = 32) String npFlat,
        /** Recipient as on the waybill (NP wants the surname and the name apart). */
        @Size(max = 128) String recipientLastName,
        @Size(max = 128) String recipientFirstName,
        @Size(max = 128) String recipientMiddleName) {

    public record Item(
            @NotBlank String productId,
            String variantId,
            @Max(1000) int quantity) {
    }
}
