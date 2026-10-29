package com.maxsolch.shop.order.app;

import com.maxsolch.shop.platform.cache.CacheConfig;
import lombok.extern.slf4j.Slf4j;
import org.springframework.cache.Cache;
import org.springframework.cache.CacheManager;
import org.springframework.stereotype.Service;

/**
 * Stops one checkout from becoming two orders.
 *
 * <p>A flaky mobile connection (or an impatient second tap on "Оформить заказ") used to place the
 * order twice: two rows, two Telegram cards, and stock deducted twice. The client sends an
 * {@code Idempotency-Key} it generates once per checkout attempt; the first request stores the
 * resulting order id under that key and every retry with the same key gets that same id back
 * instead of creating a new order.
 *
 * <p>Kept in memory for 30 minutes, which comfortably covers retries of a single
 * checkout. That is scoped to one instance — fine here, since the bot is long-polling and the
 * deployment is a single container anyway.
 */
@Slf4j
@Service
public class OrderIdempotencyService {

    /** "<userId>:<key>" → created order id (UUID string); limits in {@link CacheConfig}. */
    private final Cache seen;

    public OrderIdempotencyService(CacheManager cacheManager) {
        this.seen = java.util.Objects.requireNonNull(cacheManager.getCache(CacheConfig.ORDER_IDEMPOTENCY),
                "cache " + CacheConfig.ORDER_IDEMPOTENCY);
    }

    /** @return the order id created earlier under this key, or null if this is a fresh request */
    public String previousOrderId(long userId, String idempotencyKey) {
        String cacheKey = keyOf(userId, idempotencyKey);
        return cacheKey == null ? null : seen.get(cacheKey, String.class);
    }

    public void remember(long userId, String idempotencyKey, String orderId) {
        String cacheKey = keyOf(userId, idempotencyKey);
        if (cacheKey != null && orderId != null) {
            seen.put(cacheKey, orderId);
        }
    }

    /** Scoped per user so a guessed or reused key from one client cannot affect another. */
    private static String keyOf(long userId, String idempotencyKey) {
        if (idempotencyKey == null || idempotencyKey.isBlank()) {
            return null;
        }
        String trimmed = idempotencyKey.trim();
        if (trimmed.length() > 128) {
            trimmed = trimmed.substring(0, 128);
        }
        return userId + ":" + trimmed;
    }
}
