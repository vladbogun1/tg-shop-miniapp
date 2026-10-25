package com.maxsolch.shop.security;

import com.maxsolch.shop.domain.AdminUser;
import com.maxsolch.shop.repository.AdminUserRepository;
import com.maxsolch.shop.web.ForbiddenException;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Component;

/**
 * Role checks beyond «is an admin» — the bean behind {@link RequiredSuperAdmin}
 * ({@code @adminAccess.isSuperAdmin(authentication)}). Read from the database on EVERY call (no
 * cache): it guards only the «Админы» section, which is rare traffic, and a demotion or a block must
 * take effect on the very next request, not after a cache window or token expiry.
 */
@Component("adminAccess")
public class AdminAccess {

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

    /**
     * For a rule that depends on a request parameter (e.g. {@code force=1}), where a method-level
     * {@link RequiredSuperAdmin} would be too coarse: 403 with a readable text unless the caller is SUPER_ADMIN.
     */
    public void requireSuperAdmin(Authentication authentication, String what) {
        if (!isSuperAdmin(authentication)) {
            throw new ForbiddenException(what + " — только главный админ");
        }
    }

    public boolean isSuperAdmin(long adminId) {
        return adminUserRepository.findByTelegramUserIdAndActiveTrue(adminId)
                .map(AdminUser::isSuperAdmin)
                .orElse(false);
    }
}
