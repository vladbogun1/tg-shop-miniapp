package com.maxsolch.shop.push;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.List;

/** Plain-SQL access to {@code admin_push_subscriptions} (V34). */
@Repository
public class PushSubscriptionStore {

    /** One device. */
    public record Subscription(long id, long adminId, String endpoint, String p256dh, String auth) {
    }

    private static final String COLUMNS = "id, admin_id, endpoint, p256dh, auth";

    private final JdbcTemplate jdbc;

    public PushSubscriptionStore(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** Insert, or refresh the keys/owner of a known endpoint (browsers rotate keys on resubscribe). */
    public void upsert(long adminId, String endpoint, String p256dh, String auth, String userAgent) {
        jdbc.update("insert into admin_push_subscriptions (admin_id, endpoint, endpoint_hash, p256dh, auth, user_agent) "
                        + "values (?, ?, ?, ?, ?, ?) "
                        + "on duplicate key update admin_id = values(admin_id), endpoint = values(endpoint), "
                        + "p256dh = values(p256dh), auth = values(auth), user_agent = values(user_agent), failures = 0",
                adminId, endpoint, hash(endpoint), p256dh, auth, userAgent);
    }

    public boolean delete(String endpoint) {
        return jdbc.update("delete from admin_push_subscriptions where endpoint_hash = ?", hash(endpoint)) > 0;
    }

    public void deleteById(long id) {
        jdbc.update("delete from admin_push_subscriptions where id = ?", id);
    }

    public List<Subscription> all() {
        return jdbc.query("select " + COLUMNS + " from admin_push_subscriptions order by id", (rs, i) -> map(rs));
    }

    public List<Subscription> byAdmin(long adminId) {
        return jdbc.query("select " + COLUMNS + " from admin_push_subscriptions where admin_id = ? order by id",
                (rs, i) -> map(rs), adminId);
    }

    public List<Subscription> byEndpoint(String endpoint) {
        return jdbc.query("select " + COLUMNS + " from admin_push_subscriptions where endpoint_hash = ?",
                (rs, i) -> map(rs), hash(endpoint));
    }

    public int countByAdmin(long adminId) {
        Integer n = jdbc.queryForObject("select count(*) from admin_push_subscriptions where admin_id = ?",
                Integer.class, adminId);
        return n == null ? 0 : n;
    }

    public void markSuccess(long id) {
        jdbc.update("update admin_push_subscriptions set last_success_at = current_timestamp, failures = 0 where id = ?", id);
    }

    public void markFailure(long id) {
        jdbc.update("update admin_push_subscriptions set failures = failures + 1 where id = ?", id);
    }

    private static Subscription map(java.sql.ResultSet rs) throws java.sql.SQLException {
        return new Subscription(rs.getLong("id"), rs.getLong("admin_id"), rs.getString("endpoint"),
                rs.getString("p256dh"), rs.getString("auth"));
    }

    static String hash(String endpoint) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(endpoint.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
