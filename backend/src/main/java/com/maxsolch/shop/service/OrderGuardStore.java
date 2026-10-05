package com.maxsolch.shop.service;

import com.maxsolch.shop.common.UuidUtil;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Objects;

/** Plain-SQL counters behind {@link OrderGuard} (served by {@code idx_orders_user_created}, V42). */
@Repository
public class OrderGuardStore {

    private final JdbcTemplate jdbc;

    public OrderGuardStore(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** NEW/APPROVED orders of the customer with no money received yet. */
    public int countUnpaid(long userId) {
        Integer n = jdbc.queryForObject("select count(*) from orders where user_id = ? "
                + "and status in ('NEW', 'APPROVED') and paid = false and received_minor = 0", Integer.class, userId);
        return n == null ? 0 : n;
    }

    /** Creation times of the customer's orders since {@code since}, oldest first. */
    public List<Instant> createdSince(long userId, Instant since) {
        return times("select created_at t from orders where user_id = ? and created_at >= ? order by created_at",
                userId, since);
    }

    /** When the customer cancelled their own orders since {@code since}, oldest first. */
    public List<Instant> selfCancelsSince(long userId, Instant since) {
        return times("select rejected_at t from orders where user_id = ? and cancelled_by_customer = true "
                + "and rejected_at >= ? order by rejected_at", userId, since);
    }

    /** Catalog title of a product for an error message; the id when unknown. */
    public String productTitle(String productId) {
        try {
            List<String> rows = jdbc.queryForList("select title from products where id = ?", String.class,
                    (Object) UuidUtil.toBytes(productId));
            return rows.isEmpty() ? productId : rows.get(0);
        } catch (IllegalArgumentException e) {
            return productId;
        }
    }

    private List<Instant> times(String sql, long userId, Instant since) {
        return jdbc.query(sql, (rs, i) -> {
            Timestamp t = rs.getTimestamp("t");
            return t == null ? null : t.toInstant();
        }, userId, Timestamp.from(since)).stream().filter(Objects::nonNull).toList();
    }
}
