package com.maxsolch.shop.order.app;

import com.maxsolch.shop.order.infra.OrderRepository;
import com.maxsolch.shop.platform.journal.JournalOrders;
import org.springframework.stereotype.Service;

import java.util.Optional;

/** Implements the journal's {@link JournalOrders}: the customer of an order, for entries that only know the order. */
@Service
public class JournalOrdersFromOrders implements JournalOrders {

    private final OrderRepository orders;

    public JournalOrdersFromOrders(OrderRepository orders) {
        this.orders = orders;
    }

    @Override
    public Optional<Long> customerOf(byte[] orderId) {
        return Optional.ofNullable(orders.customerOf(orderId));
    }
}
