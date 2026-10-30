package com.maxsolch.shop.order.app;

import com.maxsolch.shop.customer.app.OrderHistory;
import com.maxsolch.shop.customer.app.UserMetricsDto.TopCustomer;
import com.maxsolch.shop.order.infra.OrderRepository;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Collection;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** The orders of customers, read for the customer module's admin screens and broadcast audiences. */
@Service
public class CustomerOrderHistory implements OrderHistory {

    private final OrderRepository orders;

    public CustomerOrderHistory(OrderRepository orders) {
        this.orders = orders;
    }

    @Override
    @Transactional(readOnly = true)
    public Map<Long, Totals> totalsOf(Collection<Long> telegramUserIds) {
        return telegramUserIds.isEmpty() ? Map.of() : totals(orders.totalsOf(telegramUserIds));
    }

    @Override
    @Transactional(readOnly = true)
    public Map<Long, Totals> totalsOfAll() {
        return totals(orders.totalsOfAll());
    }

    @Override
    @Transactional(readOnly = true)
    public Set<Long> customersWithOrders() {
        return new HashSet<>(orders.customersWithOrders());
    }

    @Override
    @Transactional(readOnly = true)
    public long countCustomersWithOrders() {
        return orders.countCustomersWithOrders();
    }

    @Override
    @Transactional(readOnly = true)
    public List<TopCustomer> topCustomers(int limit) {
        return orders.topCustomers(PageRequest.of(0, limit)).stream()
                .map(r -> new TopCustomer(((Number) r[0]).longValue(), r[1] == null ? "—" : r[1].toString(),
                        ((Number) r[2]).longValue(), ((Number) r[3]).longValue()))
                .toList();
    }

    private static Map<Long, Totals> totals(List<Object[]> rows) {
        Map<Long, Totals> out = new HashMap<>();
        for (Object[] r : rows) {
            out.put(((Number) r[0]).longValue(), new Totals(((Number) r[1]).longValue(), ((Number) r[2]).longValue()));
        }
        return out;
    }
}
