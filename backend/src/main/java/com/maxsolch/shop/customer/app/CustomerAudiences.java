package com.maxsolch.shop.customer.app;

import com.maxsolch.shop.customer.infra.UserRepository;
import com.maxsolch.shop.notification.domain.BroadcastAudiences;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.Locale;

/** The people a broadcast can reach, read from the customers' table. */
@Component
public class CustomerAudiences implements BroadcastAudiences {

    private final UserRepository users;
    private final OrderHistory orders;

    public CustomerAudiences(UserRepository users, OrderHistory orders) {
        this.users = users;
        this.orders = orders;
    }

    @Override
    public long count(String audience) {
        return switch (normalize(audience)) {
            case "active", "inactive" -> ids(audience).size();
            case "premium" -> users.audiencePremiumCount();
            default -> users.audienceAllCount();
        };
    }

    @Override
    public List<Long> ids(String audience) {
        return switch (normalize(audience)) {
            case "active" -> withOrders(true);
            case "inactive" -> withOrders(false);
            case "premium" -> users.audiencePremium();
            default -> users.audienceAll();
        };
    }

    @Override
    public List<Reachable> reachable() {
        return users.reachableLanguages().stream()
                .map(r -> new Reachable(((Number) r[0]).longValue(), (String) r[1], (String) r[2]))
                .toList();
    }

    @Override
    @Transactional
    public void markBotBlocked(long telegramUserId, Instant at) {
        users.markBotBlocked(telegramUserId, at);
    }

    /** Reachable customers who have (or have not) placed an order; the orders are asked from their owner. */
    private List<Long> withOrders(boolean ordered) {
        java.util.Set<Long> buyers = orders.customersWithOrders();
        return users.audienceAll().stream().filter(id -> buyers.contains(id) == ordered).toList();
    }

    private static String normalize(String audience) {
        return audience == null ? "all" : audience.trim().toLowerCase(Locale.ROOT);
    }
}
