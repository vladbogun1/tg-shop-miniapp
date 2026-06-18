package com.maxsolch.shop.web;

import com.maxsolch.shop.security.AuthPrincipal;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;

/**
 * Convenience accessor for the authenticated {@link AuthPrincipal} in controllers.
 */
public final class SecurityUtil {

    private SecurityUtil() {
    }

    public static AuthPrincipal currentPrincipal() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth != null && auth.getPrincipal() instanceof AuthPrincipal p) {
            return p;
        }
        throw new ForbiddenException("not authenticated");
    }

    public static long currentUserId() {
        return currentPrincipal().telegramUserId();
    }
}
