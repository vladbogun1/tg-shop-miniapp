package com.maxsolch.shop.web.dto;

/**
 * Result of placing an order. Next step: {@code POST /api/me/orders/{orderId}/payment} for the
 * monobank payment page.
 *
 * @param amountDueMinor what has to be paid online now (the whole order or the prepayment)
 */
public record CreateOrderResponse(String orderId, long amountDueMinor) {
}
