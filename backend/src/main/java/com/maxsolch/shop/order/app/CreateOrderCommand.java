package com.maxsolch.shop.order.app;

import com.maxsolch.shop.order.domain.OrderSource;

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
        OrderSource source,
        /** Gift case tier with a guaranteed discount: CASE (spin, the default) | DISCOUNT (take the discount now). */
        String giftChoice) {

    public CreateOrderCommand(Long userId, Long tgUserId, String tgUsername, List<Line> items,
                              String customerName, String phone, String comment, String promoCode,
                              String deliveryMethod, String npCityRef, String npCityName,
                              String npWarehouseRef, String npWarehouseName, String paymentOptionId,
                              OrderSource source) {
        this(userId, tgUserId, tgUsername, items, customerName, phone, comment, promoCode,
                deliveryMethod, npCityRef, npCityName, npWarehouseRef, npWarehouseName,
                paymentOptionId, source, null);
    }

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
