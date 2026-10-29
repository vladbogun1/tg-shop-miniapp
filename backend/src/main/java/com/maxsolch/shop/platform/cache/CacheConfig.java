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

    @Bean
    CacheManagerCustomizer<CaffeineCacheManager> perCacheLimits() {
        return manager -> manager.registerCustomCache(ORDER_IDEMPOTENCY, Caffeine.newBuilder()
                .maximumSize(10_000)
                .expireAfterWrite(Duration.ofMinutes(30))
                .build());
    }
}
