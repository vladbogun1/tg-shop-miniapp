package com.maxsolch.shop.security;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import com.maxsolch.shop.common.UuidUtil;
import com.maxsolch.shop.repository.WebSessionRepository;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.Instant;

/**
 * Makes "end this session" (site account page or the bot button) take effect immediately
 * instead of when the 15-minute access JWT runs out: a {@code chn=web} token is accepted only while
 * its {@code web_sessions} row is live. Lookups are cached briefly; revocations through
 * {@link #invalidate(String)} drop the cached answer at once.
 */
@Component
public class WebSessionValidator {

    private final WebSessionRepository repository;
    private final Cache<String, Boolean> cache = Caffeine.newBuilder()
            .maximumSize(10_000)
            .expireAfterWrite(Duration.ofSeconds(30))
            .build();

    public WebSessionValidator(WebSessionRepository repository) {
        this.repository = repository;
    }

    /** Non-web tokens pass untouched; web tokens need a live session. */
    public boolean isValid(AuthPrincipal principal) {
        if (principal == null || !principal.isWeb()) {
            return true;
        }
        String sid = principal.sessionId();
        if (sid == null || sid.isBlank()) {
            return false;
        }
        Boolean live = cache.get(sid, this::lookup);
        return Boolean.TRUE.equals(live);
    }

    public void invalidate(String sessionId) {
        if (sessionId != null) {
            cache.invalidate(sessionId);
        }
    }

    public void invalidateAll() {
        cache.invalidateAll();
    }

    private Boolean lookup(String sid) {
        try {
            return repository.findById(UuidUtil.toBytes(sid))
                    .map(s -> s.isActive(Instant.now()))
                    .orElse(false);
        } catch (IllegalArgumentException e) {
            return false;
        }
    }
}
