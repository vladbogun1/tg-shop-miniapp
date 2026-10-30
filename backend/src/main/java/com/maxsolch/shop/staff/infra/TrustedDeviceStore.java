package com.maxsolch.shop.staff.infra;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.Timestamp;
import java.time.Instant;

/** The {@code admin_trusted_devices} table: only the SHA-256 of a device token is kept. */
@Repository
public class TrustedDeviceStore {

    private final JdbcTemplate jdbc;

    public TrustedDeviceStore(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public void insert(long adminId, String tokenHash, int tokenVersion, String label, String userAgent, String ip,
                       String city, Instant expiresAt) {
        jdbc.update("INSERT INTO admin_trusted_devices (admin_id, token_hash, token_version, device_label, user_agent, "
                        + "ip, city, expires_at) VALUES (?,?,?,?,?,?,?,?)",
                adminId, tokenHash, tokenVersion, label, userAgent, ip, city, Timestamp.from(expiresAt));
    }

    /** @return rows touched: 1 when the token vouches for this admin at {@code now} */
    public int touchIfValid(long adminId, int tokenVersion, String tokenHash, Instant now) {
        return jdbc.update("UPDATE admin_trusted_devices SET last_used_at = ? WHERE token_hash = ? "
                        + "AND admin_id = ? AND token_version = ? AND revoked_at IS NULL AND expires_at > ?",
                Timestamp.from(now), tokenHash, adminId, tokenVersion, Timestamp.from(now));
    }

    public int countActive(long adminId, int tokenVersion, Instant now) {
        Integer n = jdbc.queryForObject("SELECT COUNT(*) FROM admin_trusted_devices WHERE admin_id = ? "
                        + "AND token_version = ? AND revoked_at IS NULL AND expires_at > ?",
                Integer.class, adminId, tokenVersion, Timestamp.from(now));
        return n == null ? 0 : n;
    }

    public int revokeAll(long adminId, Instant now) {
        return jdbc.update("UPDATE admin_trusted_devices SET revoked_at = ? WHERE admin_id = ? AND revoked_at IS NULL",
                Timestamp.from(now), adminId);
    }

    public int deleteOlderThan(Instant cutoff) {
        Timestamp t = Timestamp.from(cutoff);
        return jdbc.update("DELETE FROM admin_trusted_devices WHERE expires_at < ? OR revoked_at < ?", t, t);
    }
}
