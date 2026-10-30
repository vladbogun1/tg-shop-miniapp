package com.maxsolch.shop.platform.security;

import com.maxsolch.shop.platform.cache.CacheConfig;
import org.springframework.cache.Cache;
import org.springframework.cache.CacheManager;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.util.Optional;

/**
 * Makes long-lived ADMIN tokens revocable.
 *
 * <p>JWTs are stateless, so without a check here deactivating an admin or changing their password
 * left every previously issued token fully valid until expiry. On each ADMIN request we compare the
 * token's {@code tv} claim with the row's current {@code token_version} (bumped by «Выйти на всех
 * устройствах»), require the account to still be active, and refuse a token whose {@code jti} was
 * revoked by «Выйти» ({@link AdminTokenRevocations}).
 *
 * <p>The lookup is cached for a short window so this costs at most one query per admin per
 * {@value #CACHE_SECONDS}s rather than one per request. The window is the worst-case delay
 * between revoking access and the token actually dying.
 */
@Component
public class AdminTokenValidator {

    static final long CACHE_SECONDS = 30;

    /** telegram_user_id -> current token version, or null when the admin is gone/inactive. */
    private final Cache cache;

    private final AdminDirectory admins;
    private final AdminTokenRevocations revocations;

    public AdminTokenValidator(AdminDirectory admins, AdminTokenRevocations revocations, CacheManager caches) {
        this.cache = CacheConfig.require(caches, SecurityCaches.ADMIN_TOKEN_VERSIONS.name());
        this.admins = admins;
        this.revocations = revocations;
    }

    /**
     * @return true when the principal still maps to an active admin whose token version matches
     */
    public boolean isValid(AuthPrincipal principal) {
        if (principal == null || principal.role() != Role.ADMIN) {
            return true; // customer tokens carry no revocation state
        }
        Optional<Integer> current = CacheConfig.load(cache, principal.telegramUserId(),
                () -> loadVersion(principal.telegramUserId()));
        return current != null
                && current.isPresent()
                && current.get() == principal.tokenVersion()
                && !revocations.isRevoked(principal.tokenId());
    }

    /** Drops the cached version so a revocation takes effect immediately for this instance. */
    public void invalidate(long telegramUserId) {
        cache.evict(telegramUserId);
    }

    private Optional<Integer> loadVersion(Long telegramUserId) {
        return admins.findActive(telegramUserId)
                .map(AdminDirectory.ActiveAdmin::tokenVersion);
    }
}
