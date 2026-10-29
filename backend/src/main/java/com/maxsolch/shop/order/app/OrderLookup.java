package com.maxsolch.shop.order.app;

import com.maxsolch.shop.order.domain.Order;
import com.maxsolch.shop.order.domain.OrderErrors;
import com.maxsolch.shop.order.infra.OrderRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Optional;

/**
 * Reading one order by id for the callers that only need the stored state (no card or detail mapping), plus the
 * two things another module needs to change an order inside its own transaction: the row lock and the save.
 */
@Service
public class OrderLookup {

    private final OrderRepository orderRepository;
    private final OrderOps ops;

    OrderLookup(OrderRepository orderRepository, OrderOps ops) {
        this.orderRepository = orderRepository;
        this.ops = ops;
    }

    /** The order as stored. 404 when there is none. */
    @Transactional(readOnly = true)
    public Order get(byte[] orderId) {
        return orderRepository.findById(orderId)
                .orElseThrow(() -> OrderErrors.notFound("order not found"));
    }

    /** The order as stored, or empty. */
    @Transactional(readOnly = true)
    public Optional<Order> find(byte[] orderId) {
        return orderRepository.findById(orderId);
    }

    /**
     * The order under the same row lock as every other order change, so edits cannot interleave. Joins the
     * caller's transaction; call it from a {@code @Transactional} method.
     */
    public Order lockForUpdate(byte[] orderId) {
        return ops.lock(orderId);
    }

    /** Saves a changed order (inside the caller's transaction). */
    public Order save(Order order) {
        return orderRepository.save(order);
    }
}
