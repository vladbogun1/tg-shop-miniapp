package com.maxsolch.shop.order.domain;


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
 * pending cancel request, …) stay with the code that performs it. {@code OrderMerge.merge}
 * and {@code OrderAdjustmentService.exchange} also write a status (REJECTED for the merged order,
 * NEW/APPROVED for the replacement) outside this matrix, on purpose: they are not admin transitions.
 */
public final class OrderTransitions {

    private OrderTransitions() {
    }

    public static boolean allowed(OrderStatus from, OrderStatus to) {
        return switch (to) {
            case NEW -> false;
            case REJECTED -> isOpen(from) || from == OrderStatus.SHIPPED;
            case APPROVED -> from == OrderStatus.NEW;
            case SHIPPED -> isOpen(from);
            case DELIVERED -> from == OrderStatus.SHIPPED;
        };
    }

    /** Not dispatched yet and not closed: the order can still be edited, cancelled, merged. */
    public static boolean isOpen(OrderStatus status) {
        return status == OrderStatus.NEW || status == OrderStatus.APPROVED;
    }

    public static boolean isOpen(Order order) {
        return isOpen(order.getStatus());
    }
}
