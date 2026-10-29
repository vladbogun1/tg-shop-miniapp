package com.maxsolch.shop.order.api;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

import java.util.List;

/**
 * An order the admin types in for a sale outside the site (phone, Instagram, in person) — V68.
 * Same rules as a checkout (stock, prices, promo); no payment deadline; the money already taken
 * goes to the money journal with its channel.
 */
public record AdminCreateOrderRequest(
        @NotEmpty(message = "добавьте товар") List<@Valid Line> items,
        @NotBlank(message = "укажите имя") @Size(max = 255) String customerName,
        @NotBlank(message = "укажите телефон") @Size(max = 64) String phone,
        @Size(max = 1000) String comment,
        String promoCode,
        /** NOVA_POSHTA | PICKUP. */
        String deliveryMethod,
        String npCityRef,
        String npCityName,
        String npWarehouseRef,
        String npWarehouseName,
        String paymentOptionId,
        /** Telegram id of the buyer if known: the order shows in their Mini App and the bot writes to them. */
        Long tgUserId,
        /** Already received (minor units); 0 = nothing yet. */
        @PositiveOrZero long paidMinor,
        /** How it came: CARD_TRANSFER, CASH, NP_COD, MONO, OTHER. */
        String paidChannel,
        @Size(max = 500) String note) {

    public record Line(@NotBlank String productId, String variantId, int quantity) {
    }
}
