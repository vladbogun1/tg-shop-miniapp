package com.maxsolch.shop.order.api;

import com.maxsolch.shop.order.app.CreateOrderCommand;
import org.springframework.lang.Nullable;

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
        /** Nova Poshta: the city and the branch / parcel locker from the directory (refs are required). */
        String npCityRef,
        String npCityName,
        String npWarehouseRef,
        String npWarehouseName,
        /** WAREHOUSE (default) | POSTOMAT | DOORS. */
        @Nullable String npServiceType,
        /** Courier (DOORS): the street (ref blank when typed by hand), building and flat. */
        @Nullable @Size(max = 64) String npStreetRef,
        @Nullable @Size(max = 255) String npStreetName,
        @Nullable @Size(max = 32) String npBuilding,
        @Nullable @Size(max = 32) String npFlat,
        String paymentOptionId,
        /**
         * Telegram id of the buyer if known: the bot writes to them, and when they have an account the order is
         * theirs (it shows in «Мої замовлення» on the site and in the Mini App).
         */
        Long tgUserId,
        /** Already received (minor units); 0 = nothing yet. */
        @PositiveOrZero long paidMinor,
        /** How it came: CARD_TRANSFER, CASH, NP_COD, MONO, OTHER. */
        String paidChannel,
        @Size(max = 500) String note) {

    public record Line(@NotBlank String productId, @Nullable String variantId, int quantity) {
    }

    /** The Nova Poshta service and courier address; null when nothing but a branch was sent (the older form). */
    @Nullable
    CreateOrderCommand.NpDetails npDetails() {
        if (npServiceType == null && npStreetName == null && npBuilding == null) {
            return null;
        }
        return new CreateOrderCommand.NpDetails(npServiceType, npStreetRef, npStreetName, npBuilding, npFlat,
                null, null, null);
    }
}
