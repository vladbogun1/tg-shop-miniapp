package com.maxsolch.shop.service;

import java.util.List;

/**
 * Internal command for creating an order. Built by controllers from the request body + JWT.
 * Ids are UUID strings; quantities positive; money in minor units.
 */
public record CreateOrderCommand(
        Long userId,
        Long tgUserId,
        String tgUsername,
        List<Line> items,
        String customerName,
        String phone,
        String comment,
        String promoCode,
        String deliveryMethod,
        String npCityRef,
        String npCityName,
        String npWarehouseRef,
        String npWarehouseName,
        String paymentOptionId) {

    public record Line(String productId, String variantId, int quantity) {
    }
}
