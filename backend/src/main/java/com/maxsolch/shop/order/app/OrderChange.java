package com.maxsolch.shop.order.app;

import com.maxsolch.shop.order.domain.Order;

/**
 * Result of an admin change to an order (tracking, delivery, return, exchange...): the saved order and a short
 * Russian description of what changed, for the admin audit log.
 */
public record OrderChange(Order order, String auditDetails) {
}
