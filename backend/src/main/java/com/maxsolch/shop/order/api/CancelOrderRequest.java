package com.maxsolch.shop.order.api;

/** Customer order cancellation with an optional reason. */
public record CancelOrderRequest(String reason) {
}
