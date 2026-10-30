package com.maxsolch.shop.platform.security;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.Timestamp;
import java.time.Instant;

/** The {@code admin_revoked_tokens} table: tokens revoked by «Выйти», keyed by the token's {@code jti}. */
@Repository
public class AdminRevokedTokenStore {

    private final JdbcTemplate jdbc;

    public AdminRevokedTokenStore(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public boolean exists(String jti) {
        Integer n = jdbc.queryForObject("SELECT COUNT(*) FROM admin_revoked_tokens WHERE jti = ?", Integer.class, jti);
        return n != null && n > 0;
    }

    public void insertIgnore(String jti, long telegramUserId, Instant expiresAt) {
        jdbc.update("INSERT IGNORE INTO admin_revoked_tokens (jti, telegram_user_id, expires_at) VALUES (?, ?, ?)",
                jti, telegramUserId, Timestamp.from(expiresAt));
    }

    public int deleteExpired(Instant now) {
        return jdbc.update("DELETE FROM admin_revoked_tokens WHERE expires_at < ?", Timestamp.from(now));
    }
}
