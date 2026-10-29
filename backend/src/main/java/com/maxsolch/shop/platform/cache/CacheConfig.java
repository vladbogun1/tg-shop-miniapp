package com.maxsolch.shop.platform.cache;

import com.github.benmanes.caffeine.cache.Caffeine;
import org.springframework.boot.autoconfigure.cache.CacheManagerCustomizer;
import org.springframework.cache.caffeine.CaffeineCacheManager;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.time.Duration;

/**
 * Caches whose limits differ from the single shared spec in {@code application.yml}.
 * Modules read them through {@code CacheManager.getCache(name)}, never through Caffeine directly.
 */
@Configuration
public class CacheConfig {

    /** Checkout idempotency keys ("userId:key" → order id): retries of one checkout, a half hour at most. */
    public static final String ORDER_IDEMPOTENCY = "orderIdempotency";

    /**
     * Fiscal-check lists of a paid invoice, one cache per lifetime (payment module): a check may still change
     * (45 s), every check is final (10 min), monobank failed (60 s, do not retry on every page load).
     */
    public static final String RECEIPT_CHECKS_OPEN = "receiptChecksOpen";
    public static final String RECEIPT_CHECKS_FINAL = "receiptChecksFinal";
    public static final String RECEIPT_CHECKS_ERROR = "receiptChecksError";

    /** Invoices whose receipts are all sent: skipped by the delivery job for 15 min. */
    public static final String RECEIPT_DELIVERY_QUIET = "receiptDeliveryQuiet";

    @Bean
    CacheManagerCustomizer<CaffeineCacheManager> perCacheLimits() {
        return manager -> {
            manager.registerCustomCache(ORDER_IDEMPOTENCY, expiring(10_000, Duration.ofMinutes(30)));
            manager.registerCustomCache(RECEIPT_CHECKS_OPEN, expiring(5_000, Duration.ofSeconds(45)));
            manager.registerCustomCache(RECEIPT_CHECKS_FINAL, expiring(5_000, Duration.ofMinutes(10)));
            manager.registerCustomCache(RECEIPT_CHECKS_ERROR, expiring(5_000, Duration.ofSeconds(60)));
            manager.registerCustomCache(RECEIPT_DELIVERY_QUIET, expiring(10_000, Duration.ofMinutes(15)));
        };
    }

    private static com.github.benmanes.caffeine.cache.Cache<Object, Object> expiring(long max, Duration ttl) {
        return Caffeine.newBuilder().maximumSize(max).expireAfterWrite(ttl).build();
    }
}
