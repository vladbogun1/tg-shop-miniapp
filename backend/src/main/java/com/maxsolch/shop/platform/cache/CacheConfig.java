package com.maxsolch.shop.platform.cache;

import com.github.benmanes.caffeine.cache.Caffeine;
import com.github.benmanes.caffeine.cache.Ticker;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.autoconfigure.cache.CacheManagerCustomizer;
import org.springframework.cache.Cache;
import org.springframework.cache.CacheManager;
import org.springframework.cache.caffeine.CaffeineCache;
import org.springframework.cache.caffeine.CaffeineCacheManager;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.time.Clock;
import java.time.Duration;
import java.util.concurrent.TimeUnit;

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

    /** All stored translations of one language (translation module): 3 languages at most, a minute. */
    public static final String TRANSLATION_SNAPSHOTS = "translationSnapshots";

    @Bean
    CacheManagerCustomizer<CaffeineCacheManager> perCacheLimits(ObjectProvider<CacheSpec> moduleCaches) {
        return manager -> {
            manager.registerCustomCache(TRANSLATION_SNAPSHOTS, expiring(8, Duration.ofSeconds(60)));
            manager.registerCustomCache(ORDER_IDEMPOTENCY, expiring(10_000, Duration.ofMinutes(30)));
            manager.registerCustomCache(RECEIPT_CHECKS_OPEN, expiring(5_000, Duration.ofSeconds(45)));
            manager.registerCustomCache(RECEIPT_CHECKS_FINAL, expiring(5_000, Duration.ofMinutes(10)));
            manager.registerCustomCache(RECEIPT_CHECKS_ERROR, expiring(5_000, Duration.ofSeconds(60)));
            manager.registerCustomCache(RECEIPT_DELIVERY_QUIET, expiring(10_000, Duration.ofMinutes(15)));
            moduleCaches.orderedStream().forEach(spec -> manager.registerCustomCache(spec.name(),
                    expiring(spec.maxSize(), spec.ttl())));
        };
    }

    /** The cache {@code name} of the manager; a missing one is a wiring mistake, not something to work around. */
    public static Cache require(CacheManager manager, String name) {
        return java.util.Objects.requireNonNull(manager.getCache(name), "cache " + name);
    }

    /**
     * The value of {@code key}, loaded by {@code loader} on a miss. An exception of the loader reaches the caller as it is
     * (Spring wraps it in {@code ValueRetrievalException}; a caller that catches a {@code DomainException} must not notice).
     */
    public static <T> T load(Cache cache, Object key, java.util.function.Supplier<T> loader) {
        try {
            return cache.get(key, loader::get);
        } catch (Cache.ValueRetrievalException e) {
            if (e.getCause() instanceof RuntimeException cause) {
                throw cause;
            }
            throw e;
        }
    }

    /**
     * A cache with the limits of {@code spec} whose lifetime ticks on {@code clock} instead of the wall clock: unit
     * tests of expiry (a rotation grace, a lock window) move a mutable {@link Clock} instead of sleeping.
     */
    public static Cache onClock(CacheSpec spec, Clock clock) {
        Ticker ticker = () -> TimeUnit.MILLISECONDS.toNanos(clock.millis());
        return new CaffeineCache(spec.name(), Caffeine.newBuilder().maximumSize(spec.maxSize())
                .expireAfterWrite(spec.ttl()).ticker(ticker).build());
    }

    private static com.github.benmanes.caffeine.cache.Cache<Object, Object> expiring(long max, Duration ttl) {
        return Caffeine.newBuilder().maximumSize(max).expireAfterWrite(ttl).build();
    }
}
