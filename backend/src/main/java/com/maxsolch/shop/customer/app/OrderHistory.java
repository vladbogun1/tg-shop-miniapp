package com.maxsolch.shop.customer.app;

import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * What the customer module asks about the orders of its customers. The port is declared here and implemented by
 * {@code order}, the owner of the {@code orders} table: customer (a lower row) must not know that table, and
 * {@code order} must not be called from below.
 */
public interface OrderHistory {

    /** Orders of one customer: how many (any status) and how much was spent (everything but REJECTED). */
    record Totals(long ordersCount, long spentMinor) {
        public static final Totals NONE = new Totals(0, 0);
    }

    /** Totals of the given customers; a customer without orders is absent from the map. */
    Map<Long, Totals> totalsOf(Collection<Long> telegramUserIds);

    /** Totals of every customer that has at least one order. */
    Map<Long, Totals> totalsOfAll();

    /** Telegram ids of customers with at least one order of any status. */
    Set<Long> customersWithOrders();

    /** How many distinct Telegram customers (id &gt; 0) have an order. */
    long countCustomersWithOrders();

    /** The customers who spent most (REJECTED orders do not count), best first. */
    List<UserMetricsDto.TopCustomer> topCustomers(int limit);
}
