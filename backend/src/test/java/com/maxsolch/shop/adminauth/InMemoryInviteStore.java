package com.maxsolch.shop.adminauth;

import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.TreeMap;

/** {@link AdminInviteStore} over a map, with the same «only if still live» rules as the SQL. */
final class InMemoryInviteStore implements AdminInviteStore {

    final Map<Long, AdminInvite> rows = new TreeMap<>();
    private long seq = 0;

    @Override
    public long insert(AdminInvite.Draft d) {
        long id = ++seq;
        rows.put(id, new AdminInvite(id, d.tokenHash(), d.kind(), d.telegramUserId(), d.name(), d.role(),
                d.invitedBy(), Instant.EPOCH, d.expiresAt(), null, null, false, null, null, null, null, 0));
        return id;
    }

    @Override
    public Optional<AdminInvite> byHash(String tokenHash) {
        return rows.values().stream().filter(i -> i.tokenHash().equals(tokenHash)).findFirst();
    }

    @Override
    public Optional<AdminInvite> byId(long id) {
        return Optional.ofNullable(rows.get(id));
    }

    @Override
    public List<AdminInvite> live(Instant now) {
        return rows.values().stream().filter(i -> i.live(now)).toList();
    }

    @Override
    public int revokeOpenFor(long telegramUserId, Instant now) {
        int n = 0;
        for (AdminInvite i : List.copyOf(rows.values())) {
            if (i.telegramUserId() == telegramUserId && i.usedAt() == null && i.revokedAt() == null) {
                rows.put(i.id(), with(i, null, now, i.delivered(), null, null, null, null, i.failedAttempts()));
                n++;
            }
        }
        return n;
    }

    @Override
    public boolean revoke(long id, Instant now) {
        AdminInvite i = rows.get(id);
        if (i == null || i.usedAt() != null || i.revokedAt() != null) {
            return false;
        }
        rows.put(id, with(i, null, now, i.delivered(), null, null, null, null, i.failedAttempts()));
        return true;
    }

    @Override
    public void markDelivered(long id, boolean delivered) {
        AdminInvite i = rows.get(id);
        rows.put(id, with(i, i.usedAt(), i.revokedAt(), delivered, i.pendingUsername(), i.pendingPasswordHash(),
                i.pendingTotpEnc(), i.pendingAt(), i.failedAttempts()));
    }

    @Override
    public void savePending(long id, String username, String passwordHash, String totpEnc, Instant at) {
        AdminInvite i = rows.get(id);
        rows.put(id, with(i, i.usedAt(), i.revokedAt(), i.delivered(), username, passwordHash, totpEnc, at,
                i.failedAttempts()));
    }

    @Override
    public int incrementFailures(long id) {
        AdminInvite i = rows.get(id);
        rows.put(id, with(i, i.usedAt(), i.revokedAt(), i.delivered(), i.pendingUsername(), i.pendingPasswordHash(),
                i.pendingTotpEnc(), i.pendingAt(), i.failedAttempts() + 1));
        return i.failedAttempts() + 1;
    }

    @Override
    public boolean claim(long id, Instant now) {
        AdminInvite i = rows.get(id);
        if (i == null || !i.live(now)) {
            return false;
        }
        rows.put(id, with(i, now, null, i.delivered(), i.pendingUsername(), null, null, i.pendingAt(),
                i.failedAttempts()));
        return true;
    }

    @Override
    public boolean usernamePending(String username, long exceptInviteId, Instant now) {
        String u = username.toLowerCase(Locale.ROOT);
        return rows.values().stream().anyMatch(i -> i.id() != exceptInviteId && i.live(now)
                && i.pendingUsername() != null && i.pendingUsername().toLowerCase(Locale.ROOT).equals(u));
    }

    @Override
    public int purge(Instant before) {
        return 0;
    }

    private static AdminInvite with(AdminInvite i, Instant usedAt, Instant revokedAt, boolean delivered,
                                    String pendingUsername, String pendingPasswordHash, String pendingTotpEnc,
                                    Instant pendingAt, int failures) {
        return new AdminInvite(i.id(), i.tokenHash(), i.kind(), i.telegramUserId(), i.name(), i.role(), i.invitedBy(),
                i.createdAt(), i.expiresAt(), usedAt, revokedAt, delivered, pendingUsername, pendingPasswordHash,
                pendingTotpEnc, pendingAt, failures);
    }
}
