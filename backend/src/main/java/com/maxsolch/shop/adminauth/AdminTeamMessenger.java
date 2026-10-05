package com.maxsolch.shop.adminauth;

import java.time.Instant;

/**
 * Messages from the shop bot about the admin team (stage 2), implemented by
 * {@code tg.AdminSecurityNotifier}.
 */
public interface AdminTeamMessenger {

    /**
     * Sends the invite link with a button, synchronously.
     *
     * @return {@code true} when Telegram accepted the message; {@code false} when there is no bot, no
     *         absolute admin URL, or the person never pressed /start — the caller then shows the link
     *         to the super admin to hand over personally
     */
    boolean sendInvite(long telegramUserId, String link, AdminInvite.Kind kind, String roleLabel, String inviterName,
                       Instant expiresAt);

    /** Best-effort notice to an admin about their own account (2FA / password reset, block). */
    void accountNotice(long adminId, String html);
}
