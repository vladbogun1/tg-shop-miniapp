package com.maxsolch.shop.adminauth;

import com.maxsolch.shop.domain.AdminRole;

import java.time.Instant;

/**
 * A row of {@code admin_invites} (V38): a one-time link the shop bot sends to a Telegram user so they
 * set a login, a password and 2FA. Only the SHA-256 of the token is ever stored.
 *
 * @param pendingUsername     chosen on the first step of /invite (the account is not active yet)
 * @param pendingPasswordHash BCrypt of the chosen password, waiting for the 2FA step
 * @param pendingTotpEnc      new TOTP secret (AES-GCM, AAD = telegramUserId) when 2FA is set up here
 */
public record AdminInvite(long id, String tokenHash, Kind kind, long telegramUserId, String name, AdminRole role,
                          long invitedBy, Instant createdAt, Instant expiresAt, Instant usedAt, Instant revokedAt,
                          boolean delivered, String pendingUsername, String pendingPasswordHash,
                          String pendingTotpEnc, Instant pendingAt, int failedAttempts) {

    /** What accepting the link does. */
    public enum Kind {
        /** A new admin: the row in admin_users appears only once the invite is accepted. */
        NEW,
        /** An existing admin without a login (e.g. Telegram-only): login + password (+ 2FA if missing). */
        CREDENTIALS,
        /** «Сбросить пароль»: a new password for the existing login (+ the current code, or 2FA setup). */
        PASSWORD_RESET
    }

    /** Not used, not revoked, not expired. */
    public boolean live(Instant now) {
        return usedAt == null && revokedAt == null && expiresAt.isAfter(now);
    }

    /** Data for a new row. */
    public record Draft(String tokenHash, Kind kind, long telegramUserId, String name, AdminRole role, long invitedBy,
                        Instant expiresAt) {
    }
}
