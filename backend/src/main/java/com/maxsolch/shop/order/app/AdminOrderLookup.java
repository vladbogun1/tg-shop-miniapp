package com.maxsolch.shop.order.app;

import com.maxsolch.shop.order.domain.Order;
import com.maxsolch.shop.order.infra.OrderQuickSearch;
import com.maxsolch.shop.platform.util.UuidUtil;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** What other modules (the admin «go to» box) may ask the orders: a few matches by number, name or phone. */
@Service
public class AdminOrderLookup {

    /** More rows than people wanted: one person has many orders, and the list is cut to distinct people. */
    private static final int ROWS_PER_BUYER = 8;

    /** One order in the quick search. */
    public record OrderHit(String id, String shortId, String customerName, String phone, long totalMinor,
                           String status, Instant createdAt) {
    }

    /** A buyer found by the phone of one of their orders. */
    public record BuyerHit(long telegramUserId, String name, String phone) {
    }

    private final OrderQuickSearch search;

    public AdminOrderLookup(OrderQuickSearch search) {
        this.search = search;
    }

    @Transactional(readOnly = true)
    public List<OrderHit> find(String q, int limit) {
        return search.orders(q, limit).stream().map(AdminOrderLookup::hit).toList();
    }

    @Transactional(readOnly = true)
    public List<BuyerHit> buyersByPhone(String q, int limit) {
        Map<Long, BuyerHit> byId = new LinkedHashMap<>();
        for (Object[] r : search.buyersByPhone(q, limit * ROWS_PER_BUYER)) {
            byId.putIfAbsent((Long) r[0], new BuyerHit((Long) r[0], (String) r[1], (String) r[2]));
            if (byId.size() >= limit) {
                break;
            }
        }
        return List.copyOf(byId.values());
    }

    private static OrderHit hit(Order o) {
        String full = UuidUtil.toString(o.getId());
        return new OrderHit(full, full.substring(0, 8), o.getCustomerName(), o.getPhone(), o.getTotalMinor(),
                o.getStatus().name(), o.getCreatedAt());
    }
}
