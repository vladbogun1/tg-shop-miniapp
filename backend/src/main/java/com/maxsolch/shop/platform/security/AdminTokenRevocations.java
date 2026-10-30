package com.maxsolch.shop.platform.security;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;

/**
 * Single admin tokens revoked by «Выйти» ({@code admin_revoked_tokens}, keyed by the token's
 * {@code jti}). Kept in the database so a restart does not bring a logged-out token back to life;
 * looked up through a short cache so it costs at most one query per token per
 * {@value #CACHE_SECONDS}s. Revoking on this instance updates the cache at once.
 */
@Component
public class AdminTokenRevocations {

    private static final long CACHE_SECONDS = 30;

    private final Cache<String, Boolean> cache = Caffeine.newBuilder()
            .maximumSize(10_000)
            .expireAfterWrite(Duration.ofSeconds(CACHE_SECONDS))
            .build();

    private final AdminRevokedTokenStore store;
    private final Clock clock;

    public AdminTokenRevocations(AdminRevokedTokenStore store, Clock clock) {
        this.store = store;
        this.clock = clock;
    }

    public boolean isRevoked(String jti) {
        if (jti == null || jti.isBlank()) {
            return false;
        }
        Boolean revoked = cache.get(jti, store::exists);
        return Boolean.TRUE.equals(revoked);
    }

    /** Revokes one token until its own expiry. Idempotent. */
    public void revoke(String jti, long telegramUserId, Instant expiresAt) {
        if (jti == null || jti.isBlank()) {
            return;
        }
        Instant until = expiresAt == null ? clock.instant().plus(Duration.ofDays(31)) : expiresAt;
        store.insertIgnore(jti, telegramUserId, until);
        cache.put(jti, Boolean.TRUE);
    }
}
