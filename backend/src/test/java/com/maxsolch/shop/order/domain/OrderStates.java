package com.maxsolch.shop.order.domain;

import org.springframework.test.util.ReflectionTestUtils;

/** Tests arrange an order in a given status; production code can only move it through the transition methods. */
public final class OrderStates {

    private OrderStates() {
    }

    public static Order withStatus(Order order, OrderStatus status) {
        ReflectionTestUtils.setField(order, "status", status);
        return order;
    }
}
