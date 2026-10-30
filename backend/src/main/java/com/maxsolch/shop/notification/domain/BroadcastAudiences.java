package com.maxsolch.shop.notification.domain;

import java.time.Instant;
import java.util.List;

/**
 * Who a broadcast can reach. The notification module owns the broadcast, the customers module knows the people, so
 * the customers module implements this. Audiences: {@code all}, {@code active} (placed an order), {@code inactive}
 * (never did), {@code premium}; only customers with a real Telegram chat who did not block the bot.
 */
public interface BroadcastAudiences {

    /** One reachable customer: Telegram id, the language they picked in the shop and the one Telegram reports. */
    record Reachable(long telegramUserId, String locale, String languageCode) {
    }

    long count(String audience);

    List<Long> ids(String audience);

    List<Reachable> reachable();

    /** The customer blocked the bot (or the account is gone): stop writing to them and show it in the Users tab. */
    void markBotBlocked(long telegramUserId, Instant at);
}
