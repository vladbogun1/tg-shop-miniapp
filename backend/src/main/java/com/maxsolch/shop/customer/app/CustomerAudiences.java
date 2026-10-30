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

    public CustomerAudiences(UserRepository users) {
        this.users = users;
    }

    @Override
    public long count(String audience) {
        return switch (normalize(audience)) {
            case "active" -> users.audienceActiveCount();
            case "inactive" -> users.audienceInactiveCount();
            case "premium" -> users.audiencePremiumCount();
            default -> users.audienceAllCount();
        };
    }

    @Override
    public List<Long> ids(String audience) {
        return switch (normalize(audience)) {
            case "active" -> users.audienceActive();
            case "inactive" -> users.audienceInactive();
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

    private static String normalize(String audience) {
        return audience == null ? "all" : audience.trim().toLowerCase(Locale.ROOT);
    }
}
