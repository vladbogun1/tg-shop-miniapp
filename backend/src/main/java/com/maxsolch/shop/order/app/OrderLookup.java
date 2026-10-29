package com.maxsolch.shop.order.app;

import com.maxsolch.shop.order.domain.Order;
import com.maxsolch.shop.order.domain.OrderErrors;
import com.maxsolch.shop.order.infra.OrderRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Reading one order by id for the callers that only need the stored state (no card or detail mapping). */
@Service
public class OrderLookup {

    private final OrderRepository orderRepository;

    OrderLookup(OrderRepository orderRepository) {
        this.orderRepository = orderRepository;
    }

    /** The order as stored. 404 when there is none. */
    @Transactional(readOnly = true)
    public Order get(byte[] orderId) {
        return orderRepository.findById(orderId)
                .orElseThrow(() -> OrderErrors.notFound("order not found"));
    }
}
