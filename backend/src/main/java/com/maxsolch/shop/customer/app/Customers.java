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

    /**
     * Serialises the customer's own transactions (two devices or tabs placing orders at once) until the caller's
     * transaction ends: the row lock of {@code users}. It must be the first statement of that transaction that
     * reads data, or the snapshot of REPEATABLE READ is taken before the wait and does not see what the winner
     * committed.
     */
    @Transactional(propagation = org.springframework.transaction.annotation.Propagation.MANDATORY)
    public void lockForUpdate(long telegramUserId) {
        users.lockById(telegramUserId);
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
