package com.maxsolch.shop.service;

import com.maxsolch.shop.domain.OrderSource;

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
        String paymentOptionId,
        OrderSource source) {

    /** Without a source = the Mini App (the only channel before the site existed). */
    public CreateOrderCommand(Long userId, Long tgUserId, String tgUsername, List<Line> items,
                              String customerName, String phone, String comment, String promoCode,
                              String deliveryMethod, String npCityRef, String npCityName,
                              String npWarehouseRef, String npWarehouseName, String paymentOptionId) {
        this(userId, tgUserId, tgUsername, items, customerName, phone, comment, promoCode,
                deliveryMethod, npCityRef, npCityName, npWarehouseRef, npWarehouseName,
                paymentOptionId, OrderSource.MINIAPP);
    }

    public record Line(String productId, String variantId, int quantity) {
    }
}
