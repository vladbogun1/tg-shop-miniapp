package com.maxsolch.shop.order.api;

import jakarta.validation.constraints.PositiveOrZero;

/**
 * Admin payment update for an order: the exact amount received (minor units).
 * 0 clears the payment ("снять оплату"); prepayment / full / custom are all just
 * different amounts chosen in the admin dialog. More than the order total is a 400.
 */
public record SetPaidRequest(
        @PositiveOrZero(message = "сумма не может быть отрицательной") long receivedMinor,
        /** How the money came (V68 money journal): NP_COD, CARD_TRANSFER, CASH, …; null = OTHER. */
        String channel,
        @jakarta.validation.constraints.Size(max = 500) String note) {

    public SetPaidRequest(long receivedMinor) {
        this(receivedMinor, null, null);
    }
}
