package com.maxsolch.shop.gift.infra;

import com.maxsolch.shop.gift.domain.GiftLine;
import com.maxsolch.shop.gift.domain.GiftPerson;
import com.maxsolch.shop.platform.util.UuidUtil;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Optional;

/** The gift lines of orders and the person of an order, read straight from the order tables for the registry. */
@Repository
public class GiftRegistryStore {

    private final JdbcTemplate jdbc;

    public GiftRegistryStore(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** The person of an order; empty when the order does not exist. */
    public Optional<GiftPerson> personOfOrder(byte[] orderId) {
        return jdbc.query("select user_id, tg_user_id, phone from orders where id = ?",
                (rs, n) -> new GiftPerson(nullableLong(rs, "user_id"), nullableLong(rs, "tg_user_id"),
                        GiftPerson.phoneKey(rs.getString("phone"))), (Object) orderId).stream().findFirst();
    }

    /** Gift lines of not rejected orders created since {@code since}, units returned left out. */
    public List<GiftLine> lines(Instant since) {
        return jdbc.query("""
                select o.id, o.created_at, o.delivered_at, o.status, o.customer_name, o.phone, o.tg_username,
                       o.user_id, o.tg_user_id, o.gift_tier,
                       i.title_snapshot, i.variant_name_snapshot, i.quantity - i.returned_qty qty,
                       case when i.gift_value_minor > 0 then i.gift_value_minor else coalesce(p.price_minor, 0) end unit,
                       i.auto_gift, i.case_rarity
                  from order_items i
                  join orders o on o.id = i.order_id
                  left join products p on p.id = i.product_id
                 where i.gift = 1 and o.status <> 'REJECTED' and o.created_at >= ?
                   and i.quantity - i.returned_qty > 0
                 order by o.created_at, i.id
                """, (rs, n) -> {
            String phone = rs.getString("phone");
            Timestamp delivered = rs.getTimestamp("delivered_at");
            boolean isCase = rs.getString("case_rarity") != null;
            String source = isCase ? GiftLine.SOURCE_CASE
                    : rs.getBoolean("auto_gift") ? GiftLine.SOURCE_THRESHOLD : GiftLine.SOURCE_ADMIN;
            return new GiftLine(UuidUtil.toString(rs.getBytes("id")), rs.getTimestamp("created_at").toInstant(),
                    delivered == null ? null : delivered.toInstant(), rs.getString("status"),
                    rs.getString("customer_name"), phone, rs.getString("tg_username"),
                    new GiftPerson(nullableLong(rs, "user_id"), nullableLong(rs, "tg_user_id"),
                            GiftPerson.phoneKey(phone)),
                    rs.getString("title_snapshot"), rs.getString("variant_name_snapshot"), rs.getInt("qty"),
                    rs.getLong("unit"), source, isCase ? rs.getString("gift_tier") : null);
        }, Timestamp.from(since));
    }

    private static Long nullableLong(ResultSet rs, String col) throws SQLException {
        long v = rs.getLong(col);
        return rs.wasNull() ? null : v;
    }
}
