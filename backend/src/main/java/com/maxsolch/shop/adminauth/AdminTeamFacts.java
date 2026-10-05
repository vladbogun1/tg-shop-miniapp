package com.maxsolch.shop.adminauth;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Component;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Read-mostly SQL behind the «Админы» section: last sign-in, trusted devices per admin, Telegram
 * profile of an invitee, and what in the database still points at an admin (for «Удалить»).
 */
@Component
public class AdminTeamFacts {

    /** The last finished sign-in (admin_login_log, stage 1). */
    public record LastLogin(Instant at, String city, String country, String method) {
    }

    private final JdbcTemplate jdbc;
    private final NamedParameterJdbcTemplate named;

    public AdminTeamFacts(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
        this.named = new NamedParameterJdbcTemplate(jdbc);
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
    public Map<Long, Integer> trustedDevices() {
        Map<Long, Integer> out = new HashMap<>();
        jdbc.query("SELECT d.admin_id, COUNT(*) AS n FROM admin_trusted_devices d JOIN admin_users a "
                + "ON a.telegram_user_id = d.admin_id AND a.token_version = d.token_version "
                + "WHERE d.revoked_at IS NULL AND d.expires_at > ? GROUP BY d.admin_id", rs -> {
            out.put(rs.getLong("admin_id"), rs.getInt("n"));
        }, Timestamp.from(Instant.now()));
        return out;
    }

    /** «@username · Имя Фамилия» of shop users (users table), by Telegram id. */
    public Map<Long, String> telegramLabels(Collection<Long> ids) {
        Map<Long, String> out = new HashMap<>();
        if (ids.isEmpty()) {
            return out;
        }
        named.query("SELECT telegram_user_id, username, first_name, last_name FROM users WHERE telegram_user_id IN (:ids)",
                new MapSqlParameterSource("ids", ids), rs -> {
                    String user = rs.getString("username");
                    String full = ((rs.getString("first_name") == null ? "" : rs.getString("first_name")) + " "
                            + (rs.getString("last_name") == null ? "" : rs.getString("last_name"))).trim();
                    List<String> parts = new ArrayList<>();
                    if (user != null && !user.isBlank()) {
                        parts.add("@" + user);
                    }
                    if (!full.isEmpty()) {
                        parts.add(full);
                    }
                    if (!parts.isEmpty()) {
                        out.put(rs.getLong("telegram_user_id"), String.join(" · ", parts));
                    }
                });
        return out;
    }

    /**
     * What in the shop's data was done by this admin. No foreign keys point at admin_users — the
     * rows keep the id and a snapshot of the name — but deleting an admin with such history would
     * leave «who did it» pointing at nobody, so those are blocked instead. Own sign-in / account
     * entries ({@code ADMIN_*} in the journal, admin_login_log) do not count.
     *
     * @return human-readable reasons, empty when the admin can be deleted
     */
    public List<String> history(long adminId) {
        List<String> out = new ArrayList<>();
        int journal = count("SELECT COUNT(*) FROM admin_audit_log WHERE admin_id = ? AND action NOT LIKE 'ADMIN\\_%'",
                adminId);
        if (journal > 0) {
            out.add("записей в журнале: " + journal);
        }
        int chat = count("SELECT COUNT(*) FROM order_messages WHERE sender_type = 'ADMIN' AND sender_id = ?", adminId);
        if (chat > 0) {
            out.add("сообщений в чатах заказов: " + chat);
        }
        int broadcasts = count("SELECT COUNT(*) FROM broadcasts WHERE admin_id = ?", adminId);
        if (broadcasts > 0) {
            out.add("рассылок: " + broadcasts);
        }
        int marks = count("SELECT COUNT(*) FROM inbox_marks WHERE created_by = ?", adminId);
        if (marks > 0) {
            out.add("отметок в «Внимание»: " + marks);
        }
        return out;
    }

    /** Order notifications must not reach a blocked / deleted admin's devices. */
    public int deletePushSubscriptions(long adminId) {
        return jdbc.update("DELETE FROM admin_push_subscriptions WHERE admin_id = ?", adminId);
    }

    private int count(String sql, long id) {
        Integer n = jdbc.queryForObject(sql, Integer.class, id);
        return n == null ? 0 : n;
    }
}
