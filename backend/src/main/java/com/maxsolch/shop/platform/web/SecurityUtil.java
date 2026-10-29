package com.maxsolch.shop.platform.web;

import com.maxsolch.shop.platform.security.AuthPrincipal;

/**
 * Convenience accessor for the authenticated {@link AuthPrincipal}.
 *
 * @deprecated inject {@link CurrentActor}; this only delegates to it.
 */
@Deprecated
public final class SecurityUtil {

    private SecurityUtil() {
    }

    public static AuthPrincipal currentPrincipal() {
        return CurrentActor.read();
    }

    public static long currentUserId() {
        return currentPrincipal().telegramUserId();
    }
}
