package com.maxsolch.shop.staff.infra;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.HashMap;
import java.util.Map;

/**
 * SQL behind the «Админы» section over the staff tables: last sign-in and trusted devices per admin.
 * What other modules hold about an admin is asked from them ({@code AdminHistory}, {@code Customers}).
 */
@org.springframework.stereotype.Repository
public class AdminTeamQueries {

    /** The last finished sign-in (admin_login_log, stage 1). */
    public record LastLogin(Instant at, String city, String country, String method) {
    }

    private final JdbcTemplate jdbc;

    public AdminTeamQueries(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public Map<Long, LastLogin> lastLogins() {
        Map<Long, LastLogin> out = new HashMap<>();
        jdbc.query("SELECT l.admin_id, l.created_at, l.city, l.country, l.method FROM admin_login_log l "
                + "JOIN (SELECT admin_id, MAX(id) AS id FROM admin_login_log WHERE result = 'OK' AND admin_id IS NOT NULL "
                + "GROUP BY admin_id) m ON m.id = l.id", rs -> {
            out.put(rs.getLong("admin_id"), new LastLogin(rs.getTimestamp("created_at").toInstant(),
                    rs.getString("city"), rs.getString("country"), rs.getString("method")));
        });
        return out;
    }

    /** Devices that would skip the code right now, per admin. */
    public Map<Long, Integer> trustedDevices(Instant now) {
        Map<Long, Integer> out = new HashMap<>();
        jdbc.query("SELECT d.admin_id, COUNT(*) AS n FROM admin_trusted_devices d JOIN admin_users a "
                + "ON a.telegram_user_id = d.admin_id AND a.token_version = d.token_version "
                + "WHERE d.revoked_at IS NULL AND d.expires_at > ? GROUP BY d.admin_id", rs -> {
            out.put(rs.getLong("admin_id"), rs.getInt("n"));
        }, Timestamp.from(now));
        return out;
    }
}
