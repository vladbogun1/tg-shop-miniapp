package com.maxsolch.shop.inbox.app;

import com.maxsolch.shop.catalog.app.AdminProductLookup;
import com.maxsolch.shop.catalog.app.AdminProductLookup.ProductHit;
import com.maxsolch.shop.customer.app.AdminCustomerLookup;
import com.maxsolch.shop.customer.app.AdminCustomerLookup.CustomerHit;
import com.maxsolch.shop.order.app.AdminOrderLookup;
import com.maxsolch.shop.order.app.AdminOrderLookup.BuyerHit;
import com.maxsolch.shop.order.app.AdminOrderLookup.OrderHit;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * The admin's «go to» box (Ctrl K) looking beyond the sections: orders, products and customers. Each module answers for
 * its own tables through its {@code app}; this class only puts the three answers side by side. A customer is found by
 * name or @username (customers) or by the phone of one of their orders (orders), without duplicates.
 */
@Service
public class AdminSearch {

    /** At most this many rows of each kind. */
    public static final int PER_KIND = 5;
    /** Shorter terms match half of the shop. */
    static final int MIN_LENGTH = 2;

    /** The three groups of the box; an empty group is an empty list. */
    public record SearchResults(List<OrderHit> orders, List<ProductHit> products, List<CustomerHit> customers) {
        static final SearchResults NONE = new SearchResults(List.of(), List.of(), List.of());
    }

    private final AdminOrderLookup orders;
    private final AdminProductLookup products;
    private final AdminCustomerLookup customers;

    public AdminSearch(AdminOrderLookup orders, AdminProductLookup products, AdminCustomerLookup customers) {
        this.orders = orders;
        this.products = products;
        this.customers = customers;
    }

    public SearchResults search(String q) {
        String term = q == null ? "" : q.trim();
        if (term.length() < MIN_LENGTH) {
            return SearchResults.NONE;
        }
        return new SearchResults(orders.find(term, PER_KIND), products.find(term, PER_KIND), people(term));
    }

    private List<CustomerHit> people(String term) {
        List<CustomerHit> out = new ArrayList<>(customers.find(term, PER_KIND));
        List<Long> known = out.stream().map(CustomerHit::telegramUserId).toList();
        Map<Long, String> phones = new LinkedHashMap<>();
        for (BuyerHit b : orders.buyersByPhone(term, PER_KIND)) {
            if (known.contains(b.telegramUserId())) {
                continue;
            }
            phones.put(b.telegramUserId(), b.phone());
        }
        if (!phones.isEmpty()) {
            out.addAll(customers.byIds(List.copyOf(phones.keySet()), phones));
        }
        return out.size() > PER_KIND ? List.copyOf(out.subList(0, PER_KIND)) : List.copyOf(out);
    }
}
