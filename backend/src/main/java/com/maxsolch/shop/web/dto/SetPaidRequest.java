package com.maxsolch.shop.web.dto;

/**
 * Admin payment update for an order: the exact amount received (minor units).
 * 0 clears the payment ("снять оплату"); prepayment / full / custom are all just
 * different amounts chosen in the admin dialog.
 */
public record SetPaidRequest(long receivedMinor) {
}
