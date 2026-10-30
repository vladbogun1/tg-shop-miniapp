package com.maxsolch.shop.order.app;

import com.maxsolch.shop.order.infra.OrderRepository;
import com.maxsolch.shop.platform.config.StompTopicOwner;
import com.maxsolch.shop.platform.util.UuidUtil;
import org.springframework.stereotype.Component;

/** {@code /topic/orders/{orderId}/chat}: only the customer of the order (admins are let in by the platform). */
@Component
public class OrderTopicOwner implements StompTopicOwner {

    private final OrderRepository orders;

    public OrderTopicOwner(OrderRepository orders) {
        this.orders = orders;
    }

    @Override
    public String topicPrefix() {
        return "/topic/orders/";
    }

    /** @throws IllegalArgumentException when {@code key} is not an order id */
    @Override
    public boolean isOwner(String key, long userId) {
        byte[] id;
        try {
            id = UuidUtil.toBytes(key);
        } catch (IllegalArgumentException e) {
            throw new IllegalArgumentException("invalid order id");
        }
        return orders.findById(id)
                .map(o -> o.getUserId() != null && o.getUserId() == userId)
                .orElse(false);
    }

    @Override
    public String forbiddenMessage() {
        return "forbidden: not your order";
    }
}
