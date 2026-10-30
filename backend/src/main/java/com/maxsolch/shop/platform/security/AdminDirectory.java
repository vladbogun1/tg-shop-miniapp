package com.maxsolch.shop.platform.security;

import java.util.Optional;

/**
 * What the platform (token check, role guards, audit author) needs to know about an admin account. The admin
 * accounts live in {@code staff}; it implements this port, so {@code platform} does not depend on it.
 */
public interface AdminDirectory {

    /** An active admin: the token version a JWT must carry, and what he may open. */
    record ActiveAdmin(int tokenVersion, boolean superAdmin, boolean finance) {
    }

    /** Read from the database on every call: a demotion or a block takes effect on the next request. */
    Optional<ActiveAdmin> findActive(long telegramUserId);

    /** True when the token with this {@code jti} was revoked by «Выйти» (the revocations live in {@code staff}). */
    boolean isTokenRevoked(String tokenId);

    /** The admin's name for the journal and chat: name, else username; empty when there is no such admin. */
    Optional<String> displayName(long telegramUserId);
}
