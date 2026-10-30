package com.maxsolch.shop.customer.app;

import com.maxsolch.shop.customer.domain.User;
import com.maxsolch.shop.customer.infra.UserRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

/**
 * What the other modules may ask the customers module: who a customer is (name, username, language) and the
 * "blocked the bot" mark. They never touch the customers table themselves.
 */
@Service
public class Customers {

    private final UserRepository users;

    public Customers(UserRepository users) {
        this.users = users;
    }

    public Optional<User> findById(Long telegramUserId) {
        return users.findById(telegramUserId);
    }

    public List<User> findAllById(Iterable<Long> telegramUserIds) {
        return users.findAllById(telegramUserIds);
    }

    /** The language the customer chose in the shop (users.locale), if any. */
    public Optional<String> localeOf(long telegramUserId) {
        return users.localeOf(telegramUserId);
    }

    /** The customer blocked the bot: stop writing to them and show it in the Users tab. */
    @Transactional
    public void markBotBlocked(long telegramUserId, Instant at) {
        users.markBotBlocked(telegramUserId, at);
    }
}
