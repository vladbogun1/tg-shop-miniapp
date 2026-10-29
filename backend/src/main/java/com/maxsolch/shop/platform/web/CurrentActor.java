package com.maxsolch.shop.platform.web;

import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.platform.security.AuthPrincipal;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;

/**
 * Who is acting right now. A bean instead of the static {@code SecurityUtil}, so use cases take it as a dependency
 * and tests substitute it. Audit and "acting admin" checks live in the use case (app layer) and read the actor here.
 */
@Component
public class CurrentActor {

    /** The authenticated principal; 401 when there is none. */
    public AuthPrincipal principal() {
        return read();
    }

    /** Telegram user id / admin PK of the actor; 401 when there is none. */
    public long userId() {
        return read().telegramUserId();
    }

    /** True when somebody is authenticated (background jobs and public endpoints have no actor). */
    public boolean isPresent() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        return auth != null && auth.getPrincipal() instanceof AuthPrincipal;
    }

    /** The lookup itself, shared with the deprecated static {@link SecurityUtil}. */
    static AuthPrincipal read() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth != null && auth.getPrincipal() instanceof AuthPrincipal p) {
            return p;
        }
        // No principal at all means "not authenticated" (401), not "authenticated but not allowed" (403):
        // the admin frontend distinguishes them when deciding to re-login. Plain text on purpose: this runs
        // outside a request-scoped bean and the apps only show it when a session died.
        throw new DomainException.Unauthorized("not authenticated", null);
    }
}
