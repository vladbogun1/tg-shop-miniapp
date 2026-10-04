package com.maxsolch.shop.security;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;

/**
 * Single admin tokens revoked by «Выйти» ({@code admin_revoked_tokens}, keyed by the token's
 * {@code jti}). Kept in the database so a restart does not bring a logged-out token back to life;
 * looked up through a short cache so it costs at most one query per token per
 * {@value #CACHE_SECONDS}s. Revoking on this instance updates the cache at once.
 */
@Slf4j
@Component
public class AdminTokenRevocations {

    private static final long CACHE_SECONDS = 30;

    private final Cache<String, Boolean> cache = Caffeine.newBuilder()
            .maximumSize(10_000)
            .expireAfterWrite(Duration.ofSeconds(CACHE_SECONDS))
            .build();

    private final JdbcTemplate jdbc;

    public AdminTokenRevocations(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public boolean isRevoked(String jti) {
        if (jti == null || jti.isBlank()) {
            return false;
        }
        Boolean revoked = cache.get(jti, this::load);
        return Boolean.TRUE.equals(revoked);
    }

    /** Revokes one token until its own expiry. Idempotent. */
    public void revoke(String jti, long telegramUserId, Instant expiresAt) {
        if (jti == null || jti.isBlank()) {
            return;
        }
        Instant until = expiresAt == null ? Instant.now().plus(Duration.ofDays(31)) : expiresAt;
        jdbc.update("INSERT IGNORE INTO admin_revoked_tokens (jti, telegram_user_id, expires_at) VALUES (?, ?, ?)",
                jti, telegramUserId, Timestamp.from(until));
        cache.put(jti, Boolean.TRUE);
    }

    /** Rows outlive their token by nothing: once the token has expired it is refused anyway. */
    @Scheduled(cron = "0 17 * * * *")
    public void cleanup() {
        try {
            int removed = jdbc.update("DELETE FROM admin_revoked_tokens WHERE expires_at < ?",
                    Timestamp.from(Instant.now()));
            if (removed > 0) {
                log.debug("Removed {} expired admin token revocations", removed);
            }
        } catch (Exception e) {
            log.warn("Admin token revocation cleanup failed: {}", e.getMessage());
        }
    }

    private Boolean load(String jti) {
        Integer n = jdbc.queryForObject("SELECT COUNT(*) FROM admin_revoked_tokens WHERE jti = ?",
                Integer.class, jti);
        return n != null && n > 0;
    }
}
