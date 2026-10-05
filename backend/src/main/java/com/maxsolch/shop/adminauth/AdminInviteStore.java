package com.maxsolch.shop.adminauth;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

/** Storage of {@link AdminInvite}s ({@code admin_invites}); {@link JdbcAdminInviteStore} in the app. */
public interface AdminInviteStore {

    long insert(AdminInvite.Draft draft);

    Optional<AdminInvite> byHash(String tokenHash);

    Optional<AdminInvite> byId(long id);

    /** Every invite that can still be accepted. */
    List<AdminInvite> live(Instant now);

    /** Revokes every still-open invite of this Telegram user; returns how many. */
    int revokeOpenFor(long telegramUserId, Instant now);

    /** Revokes one invite unless it is already used / revoked. */
    boolean revoke(long id, Instant now);

    void markDelivered(long id, boolean delivered);

    void savePending(long id, String username, String passwordHash, String totpEnc, Instant at);

    /** One more wrong code on the 2FA step; returns the new count. */
    int incrementFailures(long id);

    /**
     * Atomically marks the invite used (only if it is still live) and wipes the pending password /
     * secret. {@code false} = somebody else got there first, or it expired / was revoked meanwhile.
     */
    boolean claim(long id, Instant now);

    /** Is this login the pending choice of another live invite? (Case-insensitive, as the DB index.) */
    boolean usernamePending(String username, long exceptInviteId, Instant now);

    /** Drops finished / expired rows older than {@code before}. */
    int purge(Instant before);
}
