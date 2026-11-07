package com.maxsolch.shop.customer.app;

import com.maxsolch.shop.customer.domain.User;
import com.maxsolch.shop.customer.infra.UserQuickSearch;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/** What other modules (the admin «go to» box) may ask the customers: a few people by name or @username. */
@Service
public class AdminCustomerLookup {

    /** One customer in the quick search; {@code phone} is filled by whoever knows it (it is on orders, not here). */
    public record CustomerHit(long telegramUserId, String name, String username, String phone) {
    }

    private final UserQuickSearch search;
    private final Customers customers;

    public AdminCustomerLookup(UserQuickSearch search, Customers customers) {
        this.search = search;
        this.customers = customers;
    }

    @Transactional(readOnly = true)
    public List<CustomerHit> find(String q, int limit) {
        if (q == null || q.isBlank()) {
            return List.of();
        }
        return search.find(q, limit).stream().map(u -> hit(u, null)).toList();
    }

    /** The customers with these Telegram ids (a phone match found them elsewhere), in the order given. */
    @Transactional(readOnly = true)
    public List<CustomerHit> byIds(List<Long> ids, java.util.Map<Long, String> phones) {
        return customers.findAllById(ids).stream()
                .sorted(java.util.Comparator.comparingInt(u -> ids.indexOf(u.getTelegramUserId())))
                .map(u -> hit(u, phones.get(u.getTelegramUserId())))
                .toList();
    }

    private static CustomerHit hit(User u, String phone) {
        String name = ((u.getFirstName() == null ? "" : u.getFirstName()) + " "
                + (u.getLastName() == null ? "" : u.getLastName())).trim();
        return new CustomerHit(u.getTelegramUserId(), name.isEmpty() ? null : name, u.getUsername(), phone);
    }
}
