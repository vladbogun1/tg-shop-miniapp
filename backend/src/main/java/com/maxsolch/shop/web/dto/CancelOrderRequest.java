package com.maxsolch.shop.web.dto;

/** Customer order cancellation with an optional reason. */
public record CancelOrderRequest(String reason) {
}
