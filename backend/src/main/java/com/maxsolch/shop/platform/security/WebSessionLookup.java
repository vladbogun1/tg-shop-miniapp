package com.maxsolch.shop.platform.security;

import java.time.Instant;

/** Is this site session (the {@code sid} of a web token) still live? The sessions live in {@code customer}. */
public interface WebSessionLookup {

    boolean isLive(String sessionId, Instant now);
}
