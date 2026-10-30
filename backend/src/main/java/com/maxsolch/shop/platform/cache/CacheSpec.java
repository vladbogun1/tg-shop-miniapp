package com.maxsolch.shop.platform.cache;

import java.time.Duration;

/**
 * Limits of one named cache. A module declares its caches as {@code CacheSpec} beans (name, size, lifetime stay next to
 * the code that owns the meaning of the number); {@link CacheConfig} registers every spec in the one Spring
 * {@code CacheManager}. The module then reads {@code CacheManager.getCache(name)} — no Caffeine in module code.
 */
public record CacheSpec(String name, long maxSize, Duration ttl) {
}
