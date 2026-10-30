package com.maxsolch.shop.staff.app;

import com.maxsolch.shop.platform.cache.CacheSpec;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.time.Duration;

/**
 * Caches of the staff module (admin sign-in), registered in the shared Spring {@code CacheManager}.
 * Per-instance on purpose while the backend runs as one container; what changes with a second instance is written
 * in docs/ARCHITECTURE.md ("Что остаётся в памяти").
 */
@Configuration
class StaffCaches {

    /** Failed attempts per login name that does not exist: after the limit the answer is the same "locked" as for a real one. */
    static final String ADMIN_UNKNOWN_LOGINS = "adminUnknownLogins";
    /** {@code jti} of pre-auth tokens already spent on a second step: a token works once. */
    static final String ADMIN_PREAUTH_USED = "adminPreAuthUsed";

    /** Revoked admin token ids (jti): the source of truth is the database, the answer is remembered briefly. */
    static final CacheSpec ADMIN_TOKEN_REVOKED = new CacheSpec("adminTokenRevoked", 10_000,
            Duration.ofSeconds(AdminTokenRevocations.CACHE_SECONDS));
    static final CacheSpec UNKNOWN_LOGINS = new CacheSpec(ADMIN_UNKNOWN_LOGINS, 10_000, AdminLockout.LOCK_DURATION);
    static final CacheSpec PREAUTH_USED = new CacheSpec(ADMIN_PREAUTH_USED, 10_000,
            Duration.ofMinutes(PreAuthTokens.TTL_MINUTES + 1));

    @Bean
    CacheSpec adminUnknownLoginsCache() {
        return UNKNOWN_LOGINS;
    }

    @Bean
    CacheSpec adminTokenRevokedCache() {
        return ADMIN_TOKEN_REVOKED;
    }

    @Bean
    CacheSpec adminPreAuthUsedCache() {
        return PREAUTH_USED;
    }
}
