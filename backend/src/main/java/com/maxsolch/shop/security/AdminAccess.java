package com.maxsolch.shop.security;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import com.maxsolch.shop.domain.AdminUser;
import com.maxsolch.shop.repository.AdminUserRepository;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Component;

import java.time.Duration;

/**
 * Role checks beyond «is an admin» — the bean behind {@link RequiredSuperAdmin}
 * ({@code @adminAccess.isSuperAdmin(authentication)}). Looked up in the database (cached
 * {@value #CACHE_SECONDS}s), not taken from the token, so a demotion does not wait for token expiry.
 */
@Component("adminAccess")
public class AdminAccess {

    private static final long CACHE_SECONDS = 30;

    private final Cache<Long, Boolean> superAdmins = Caffeine.newBuilder()
            .maximumSize(256)
            .expireAfterWrite(Duration.ofSeconds(CACHE_SECONDS))
            .build();

    private final AdminUserRepository adminUserRepository;

    public AdminAccess(AdminUserRepository adminUserRepository) {
        this.adminUserRepository = adminUserRepository;
    }

    public boolean isSuperAdmin(Authentication authentication) {
        if (authentication == null || !(authentication.getPrincipal() instanceof AuthPrincipal p)
                || p.role() != Role.ADMIN) {
            return false;
        }
        return isSuperAdmin(p.telegramUserId());
    }

    public boolean isSuperAdmin(long adminId) {
        Boolean v = superAdmins.get(adminId, id -> adminUserRepository.findByTelegramUserIdAndActiveTrue(id)
                .map(AdminUser::isSuperAdmin)
                .orElse(false));
        return Boolean.TRUE.equals(v);
    }

    /** Drop the cached answer (role changed on this instance). */
    public void invalidate(long adminId) {
        superAdmins.invalidate(adminId);
    }
}
