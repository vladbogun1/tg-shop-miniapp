package com.maxsolch.shop.platform.security;

import com.maxsolch.shop.platform.error.DomainException;
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

    private final AdminDirectory admins;

    public AdminAccess(AdminDirectory admins) {
        this.admins = admins;
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
            throw new DomainException.Forbidden(what + " — только главный админ");
        }
    }

    /**
     * The same rule for a use case that reads the actor from {@code CurrentActor}: a check that depends on the
     * request (e.g. {@code force=1}) lives in the scenario, because a method annotation cannot see the parameter.
     */
    public void requireSuperAdmin(long adminId, String what) {
        if (!isSuperAdmin(adminId)) {
            throw new DomainException.Forbidden(what + " — только главный админ");
        }
    }

    /** «Финансы»: purchase prices, batch expenses and margin — the main admin, or one he gave the right. */
    public boolean canSeeFinance(AuthPrincipal principal) {
        return principal.role() == Role.ADMIN && canSeeFinance(principal.telegramUserId());
    }

    /** The same by the admin's id, for a use case that reads the actor from {@code CurrentActor}. */
    public boolean canSeeFinance(long adminId) {
        return admins.findActive(adminId)
                .map(a -> a.superAdmin() || a.finance())
                .orElse(false);
    }

    public void requireFinance(long adminId) {
        if (!canSeeFinance(adminId)) {
            throw financeForbidden();
        }
    }

    private static DomainException.Forbidden financeForbidden() {
        return new DomainException.Forbidden("Закупка и маржа — только главному админу и тем, у кого есть «Финансы»");
    }

    public boolean isSuperAdmin(long adminId) {
        return admins.findActive(adminId)
                .map(AdminDirectory.ActiveAdmin::superAdmin)
                .orElse(false);
    }
}
