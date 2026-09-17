package com.maxsolch.shop.service;

import com.maxsolch.shop.domain.DeliveryMethod;
import com.maxsolch.shop.domain.OrderStatus;

import java.time.Instant;

/**
 * Flat projection of the order fields analytics actually needs.
 *
 * <p>The dashboard used to load full {@code Order} entities and then walk {@code order.getItems()},
 * which meant hydrating every order plus one extra query per order for its items — on a page that
 * polls every half minute. Selecting these nine columns instead keeps it to a single query with no
 * lazy loading at all; the item breakdown comes from its own grouped query.
 */
public record MetricsRow(
        OrderStatus status,
        long totalMinor,
        String currency,
        DeliveryMethod deliveryMethod,
        String paymentOptionTitle,
        Instant createdAt,
        Instant approvedAt,
        Instant shippedAt,
        Instant deliveredAt) {
}
