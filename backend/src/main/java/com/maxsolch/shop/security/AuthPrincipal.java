package com.maxsolch.shop.security;

import java.time.Instant;

/**
 * Authenticated principal extracted from a JWT.
 *
 * @param telegramUserId subject of the token (telegram user id / admin PK)
 * @param role           CUSTOMER or ADMIN
 * @param tokenVersion   value of the {@code tv} claim; for ADMIN tokens it is matched against
 *                       {@code admin_users.token_version} so credentials changes revoke old tokens
 * @param channel        {@code chn} claim: {@value #CHANNEL_WEB} for the public site's cookie
 *                       tokens, null for Mini App / admin tokens
 * @param sessionId      {@code sid} claim: the {@code web_sessions} row behind a site token
 * @param tokenId        {@code jti} claim (admin tokens): lets a single token be revoked on logout
 * @param expiresAt      {@code exp} of the token, null when unknown
 */
public record AuthPrincipal(long telegramUserId, Role role, int tokenVersion, String channel, String sessionId,
                            String tokenId, Instant expiresAt) {

    public static final String CHANNEL_WEB = "web";

    public AuthPrincipal(long telegramUserId, Role role) {
        this(telegramUserId, role, 0, null, null, null, null);
    }

    public AuthPrincipal(long telegramUserId, Role role, int tokenVersion) {
        this(telegramUserId, role, tokenVersion, null, null, null, null);
    }

    public AuthPrincipal(long telegramUserId, Role role, int tokenVersion, String channel, String sessionId) {
        this(telegramUserId, role, tokenVersion, channel, sessionId, null, null);
    }

    /** Token issued to the public website (cookie auth after the bot login). */
    public boolean isWeb() {
        return CHANNEL_WEB.equals(channel);
    }
}
