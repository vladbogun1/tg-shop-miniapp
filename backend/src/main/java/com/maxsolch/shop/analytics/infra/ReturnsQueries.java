package com.maxsolch.shop.analytics.infra;

import com.maxsolch.shop.analytics.domain.ReturnsRows.ChannelRow;
import com.maxsolch.shop.analytics.domain.ReturnsRows.ReasonRow;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

/** SQL of the «Возвраты» report: the order money journal and stock write-offs in a period [from, to). */
@Repository
public class ReturnsQueries {

    private final JdbcTemplate jdbc;

    public ReturnsQueries(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** Refunds by the channel they went back through, biggest first; exchange and merge moves are not refunds. */
    public List<ChannelRow> refundsByChannel(Instant from, Instant to) {
        return new ArrayList<>(jdbc.query(
                "select channel, sum(amount_minor) s, count(*) c from order_money_movements "
                        + "where kind = 'REFUND' and channel not in ('EXCHANGE', 'MERGE') and occurred_at >= ? and occurred_at < ? group by channel order by s desc",
                (rs, i) -> new ChannelRow(rs.getString("channel"), rs.getLong("s"), rs.getLong("c")),
                Timestamp.from(from), Timestamp.from(to)));
    }

    public long refundOrders(Instant from, Instant to) {
        Long n = jdbc.queryForObject(
                "select count(distinct order_id) from order_money_movements "
                        + "where kind = 'REFUND' and channel not in ('EXCHANGE', 'MERGE') and occurred_at >= ? and occurred_at < ?",
                Long.class, Timestamp.from(from), Timestamp.from(to));
        return n == null ? 0 : n;
    }

    /** What the shop kept on purpose: {minor units, orders}. */
    public long[] retained(Instant from, Instant to) {
        long[] retained = jdbc.queryForObject(
                "select coalesce(sum(amount_minor), 0) s, count(distinct order_id) c from order_money_movements "
                        + "where kind = 'RETAINED' and occurred_at >= ? and occurred_at < ?",
                (rs, i) -> new long[] {rs.getLong("s"), rs.getLong("c")}, Timestamp.from(from), Timestamp.from(to));
        return retained == null ? new long[] {0, 0} : retained;
    }

    public List<ReasonRow> writeoffsByReason(Instant from, Instant to) {
        return new ArrayList<>(jdbc.query(
                "select reason, sum(quantity) u, sum(quantity * unit_value_minor) v from stock_writeoffs "
                        + "where created_at >= ? and created_at < ? group by reason order by v desc",
                (rs, i) -> new ReasonRow(rs.getString("reason"), rs.getLong("u"), rs.getLong("v")),
                Timestamp.from(from), Timestamp.from(to)));
    }

    public long returnedOrders(Instant from, Instant to) {
        Long n = jdbc.queryForObject(
                "select count(*) from orders where returned_at >= ? and returned_at < ?",
                Long.class, Timestamp.from(from), Timestamp.from(to));
        return n == null ? 0 : n;
    }
}
