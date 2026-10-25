package com.maxsolch.shop.analytics.metrics;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

/**
 * «Возвраты» in the metrics (V68): money given back by the date it went back and by channel (the
 * order money journal), what the shop kept on purpose, and what was written off. Unlike
 * {@code MoneyNow.refundedMinor} — one date per order — a refund made in two steps lands on both days.
 */
@Service
public class ReturnsReport {

    private final JdbcTemplate jdbc;

    public ReturnsReport(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public record ChannelRow(String channel, long amountMinor, long count) {
    }

    public record ReasonRow(String reason, long units, long valueMinor) {
    }

    public record Returns(long refundedMinor,
                          long refundOrders,
                          List<ChannelRow> byChannel,
                          long retainedMinor,
                          long retainedOrders,
                          long writeoffUnits,
                          long writeoffMinor,
                          List<ReasonRow> writeoffsByReason,
                          /** Units customers sent back by return date (order_items.returned_qty of orders returned in the period). */
                          long returnedOrders) {
    }

    public Returns compute(Instant from, Instant to) {
        Timestamp f = Timestamp.from(from);
        Timestamp t = Timestamp.from(to);
        List<ChannelRow> channels = new ArrayList<>(jdbc.query(
                "select channel, sum(amount_minor) s, count(*) c from order_money_movements "
                        + "where kind = 'REFUND' and channel not in ('EXCHANGE', 'MERGE') and occurred_at >= ? and occurred_at < ? group by channel order by s desc",
                (rs, i) -> new ChannelRow(rs.getString("channel"), rs.getLong("s"), rs.getLong("c")), f, t));
        long refunded = channels.stream().mapToLong(ChannelRow::amountMinor).sum();
        Long refundOrders = jdbc.queryForObject(
                "select count(distinct order_id) from order_money_movements "
                        + "where kind = 'REFUND' and channel not in ('EXCHANGE', 'MERGE') and occurred_at >= ? and occurred_at < ?", Long.class, f, t);
        long[] retained = jdbc.queryForObject(
                "select coalesce(sum(amount_minor), 0) s, count(distinct order_id) c from order_money_movements "
                        + "where kind = 'RETAINED' and occurred_at >= ? and occurred_at < ?",
                (rs, i) -> new long[] {rs.getLong("s"), rs.getLong("c")}, f, t);
        List<ReasonRow> reasons = new ArrayList<>(jdbc.query(
                "select reason, sum(quantity) u, sum(quantity * unit_value_minor) v from stock_writeoffs "
                        + "where created_at >= ? and created_at < ? group by reason order by v desc",
                (rs, i) -> new ReasonRow(rs.getString("reason"), rs.getLong("u"), rs.getLong("v")), f, t));
        Long returnedOrders = jdbc.queryForObject(
                "select count(*) from orders where returned_at >= ? and returned_at < ?", Long.class, f, t);
        return new Returns(refunded, refundOrders == null ? 0 : refundOrders, channels,
                retained == null ? 0 : retained[0], retained == null ? 0 : retained[1],
                reasons.stream().mapToLong(ReasonRow::units).sum(),
                reasons.stream().mapToLong(ReasonRow::valueMinor).sum(),
                reasons,
                returnedOrders == null ? 0 : returnedOrders);
    }
}
