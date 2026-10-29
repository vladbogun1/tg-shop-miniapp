package com.maxsolch.shop.order.app;

import com.maxsolch.shop.order.infra.OrderRepository;
import com.maxsolch.shop.promo.app.PromoUsage;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/** Answers promo's question about orders: is a code text carried by any order. */
@Component
public class OrderPromoUsage implements PromoUsage {

    private final OrderRepository orderRepository;

    public OrderPromoUsage(OrderRepository orderRepository) {
        this.orderRepository = orderRepository;
    }

    @Override
    @Transactional(readOnly = true)
    public boolean usedInOrders(String code) {
        return orderRepository.countOrdersWithPromoCode(code) > 0;
    }
}
