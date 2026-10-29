package com.maxsolch.shop.service;

import com.maxsolch.shop.domain.Order;
import com.maxsolch.shop.domain.OrderStatus;

/**
 * The one place that says which order status may follow which, and what "open" means.
 *
 * <pre>
 *   from \ to   NEW  APPROVED  SHIPPED  DELIVERED  REJECTED
 *   NEW          -      +         +         -         +
 *   APPROVED     -      -         +         -         +
 *   SHIPPED      -      -         -         +         +
 *   DELIVERED    -      -         -         -         -   (a return is a separate wizard)
 *   REJECTED     -      -         -         -         -
 * </pre>
 *
 * Only the status itself is checked here; the extra rules of a transition (unpaid shipment,
 * pending cancel request, …) stay with the code that performs it. {@code OrderMergeService.merge}
 * and {@code OrderAdjustmentService.exchange} also write a status (REJECTED for the merged order,
 * NEW/APPROVED for the replacement) outside this matrix, on purpose: they are not admin transitions.
 */
final class OrderTransitions {

    private OrderTransitions() {
    }

    static boolean allowed(OrderStatus from, OrderStatus to) {
        return switch (to) {
            case NEW -> false;
            case REJECTED -> isOpen(from) || from == OrderStatus.SHIPPED;
            case APPROVED -> from == OrderStatus.NEW;
            case SHIPPED -> isOpen(from);
            case DELIVERED -> from == OrderStatus.SHIPPED;
        };
    }

    /** Not dispatched yet and not closed: the order can still be edited, cancelled, merged. */
    static boolean isOpen(OrderStatus status) {
        return status == OrderStatus.NEW || status == OrderStatus.APPROVED;
    }

    static boolean isOpen(Order order) {
        return isOpen(order.getStatus());
    }
}
