package com.maxsolch.shop.order.infra;

import com.maxsolch.shop.order.domain.DeliveredOrder;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;

/** Plain SQL of the order's review marks: the once-only flags the review module claims and the reminder scan. */
@Repository
public class OrderReviewStore {

    private final JdbcTemplate jdbc;

    public OrderReviewStore(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** True exactly once per order: the claim is one {@code ... where flag is null} update. */
    public boolean claimBonus(byte[] orderId, Instant now) {
        return jdbc.update("update orders set review_bonus_issued_at = ? "
                + "where id = ? and review_bonus_issued_at is null", Timestamp.from(now), orderId) == 1;
    }

    /** True exactly once per order. */
    public boolean claimReminder(byte[] orderId, Instant now) {
        return jdbc.update("update orders set review_reminder_sent_at = ? "
                + "where id = ? and review_reminder_sent_at is null", Timestamp.from(now), orderId) == 1;
    }

    /**
     * Orders delivered in {@code [from, to]} with no reminder yet and a Telegram chat, oldest first, one page at
     * {@code offset}; each has the ids of its lines that are paid (not a gift) and not fully returned.
     * Orders with no such line are left out.
     */
    public List<DeliveredOrder> deliveredWithoutReminder(Instant from, Instant to, int limit, int offset) {
        List<DeliveredOrder> orders = jdbc.query("select o.id, o.tg_user_id, o.delivered_at from orders o "
                        + "where o.status = 'DELIVERED' and o.review_reminder_sent_at is null "
                        + "and o.delivered_at >= ? and o.delivered_at <= ? "
                        + "and o.tg_user_id is not null and o.tg_user_id > 0 "
                        + "and exists (select 1 from order_items i where i.order_id = o.id and i.gift = false "
                        + "  and i.returned_qty < i.quantity) "
                        + "order by o.delivered_at, o.id limit ? offset ?",
                (rs, i) -> new DeliveredOrder(rs.getBytes("id"), rs.getLong("tg_user_id"),
                        rs.getTimestamp("delivered_at").toInstant(), new java.util.ArrayList<>()),
                Timestamp.from(from), Timestamp.from(to), limit, offset);
        for (DeliveredOrder d : orders) {
            d.itemIds().addAll(jdbc.queryForList("select id from order_items where order_id = ? and gift = false "
                    + "and returned_qty < quantity", Long.class, d.orderId()));
        }
        return orders;
    }
}
