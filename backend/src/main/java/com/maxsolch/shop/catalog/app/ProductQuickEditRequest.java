package com.maxsolch.shop.catalog.app;

import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

/**
 * One-field edit of the product list: the price and/or the stock, nothing else. {@code expected*} is what the admin saw
 * when he started editing: a stored value that moved since makes the call fail with 409 instead of overwriting it.
 */
public record ProductQuickEditRequest(
        /** New price in minor units; {@code null} = leave the price alone. */
        @Positive Long priceMinor,
        /** The price the admin saw; {@code null} = no check. */
        @PositiveOrZero Long expectedPriceMinor,
        /** New absolute stock; {@code null} = leave the stock alone. */
        @PositiveOrZero Integer stock,
        /** The stock the admin saw; {@code null} = no check. */
        @PositiveOrZero Integer expectedStock,
        /** Required when the stock goes down: DEFECT | INVENTORY | MISSORT | SOLD_OFFLINE | OTHER. */
        String stockReason,
        /** Free text; required for OTHER. */
        @Size(max = 500) String stockNote) {
}
