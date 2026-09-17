package com.maxsolch.shop.security;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import com.maxsolch.shop.domain.AdminUser;
import com.maxsolch.shop.repository.AdminUserRepository;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.util.Optional;

/**
 * Makes long-lived ADMIN tokens revocable.
 *
 * <p>JWTs are stateless and live for 30 days, so without a check here deactivating an admin or
 * changing their password left every previously issued token fully valid until expiry. On each
 * ADMIN request we compare the token's {@code tv} claim with the row's current
 * {@code token_version} and require the account to still be active.
 *
 * <p>The lookup is cached for a short window so this costs at most one query per admin per
 * {@value #CACHE_SECONDS}s rather than one per request. The window is the worst-case delay
 * between revoking access and the token actually dying.
 */
@Component
public class AdminTokenValidator {

    private static final long CACHE_SECONDS = 30;

    /** telegram_user_id -> current token version, or null when the admin is gone/inactive. */
    private final Cache<Long, Optional<Integer>> cache = Caffeine.newBuilder()
            .maximumSize(256)
            .expireAfterWrite(Duration.ofSeconds(CACHE_SECONDS))
            .build();

    private final AdminUserRepository adminUserRepository;

    public AdminTokenValidator(AdminUserRepository adminUserRepository) {
        this.adminUserRepository = adminUserRepository;
    }

    /**
     * @return true when the principal still maps to an active admin whose token version matches
     */
    public boolean isValid(AuthPrincipal principal) {
        if (principal == null || principal.role() != Role.ADMIN) {
            return true; // customer tokens carry no revocation state
        }
        Optional<Integer> current = cache.get(principal.telegramUserId(), this::loadVersion);
        return current != null
                && current.isPresent()
                && current.get() == principal.tokenVersion();
    }

    /** Drops the cached version so a revocation takes effect immediately for this instance. */
    public void invalidate(long telegramUserId) {
        cache.invalidate(telegramUserId);
    }

    private Optional<Integer> loadVersion(Long telegramUserId) {
        return adminUserRepository.findByTelegramUserIdAndActiveTrue(telegramUserId)
                .map(AdminUser::getTokenVersion);
    }
}
