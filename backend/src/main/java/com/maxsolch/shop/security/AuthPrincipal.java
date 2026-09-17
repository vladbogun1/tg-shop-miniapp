package com.maxsolch.shop.security;

/**
 * Authenticated principal extracted from a JWT.
 *
 * @param telegramUserId subject of the token (telegram user id / admin PK)
 * @param role           CUSTOMER or ADMIN
 * @param tokenVersion   value of the {@code tv} claim; for ADMIN tokens it is matched against
 *                       {@code admin_users.token_version} so credentials changes revoke old tokens
 */
public record AuthPrincipal(long telegramUserId, Role role, int tokenVersion) {

    public AuthPrincipal(long telegramUserId, Role role) {
        this(telegramUserId, role, 0);
    }
}
