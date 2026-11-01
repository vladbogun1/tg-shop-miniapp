package com.maxsolch.shop.order.infra;

import com.maxsolch.shop.order.app.OrderIdempotencyService;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;

/**
 * Plain-SQL rows of {@code order_idempotency} (V79) for {@link OrderIdempotencyService}. JDBC on purpose: the
 * row takes part in the caller's transaction, and a duplicate-key failure must not poison a JPA session.
 */
@Repository
public class OrderIdempotencyStore {

    private final JdbcTemplate jdbc;

    public OrderIdempotencyStore(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** The order of a finished key, or empty when the key is unknown (or its order is not attached yet). */
    public List<byte[]> orderIdsOf(long userId, String key) {
        return jdbc.query(
                "SELECT order_id FROM order_idempotency WHERE user_id = ? AND idem_key = ? AND order_id IS NOT NULL",
                (rs, i) -> rs.getBytes(1), userId, key);
    }

    /** Inserts the key; throws {@link org.springframework.dao.DuplicateKeyException} when it exists. */
    public void insert(long userId, String key, Instant now) {
        jdbc.update("INSERT INTO order_idempotency (user_id, idem_key, created_at) VALUES (?, ?, ?)",
                userId, key, Timestamp.from(now));
    }

    public void attach(long userId, String key, byte[] orderId) {
        jdbc.update("UPDATE order_idempotency SET order_id = ? WHERE user_id = ? AND idem_key = ?",
                orderId, userId, key);
    }

    public int deleteOlderThan(Instant before) {
        return jdbc.update("DELETE FROM order_idempotency WHERE created_at < ?", Timestamp.from(before));
    }
}
