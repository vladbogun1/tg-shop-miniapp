package com.maxsolch.shop.gift.infra;

import com.maxsolch.shop.gift.domain.GiftTally;
import com.maxsolch.shop.gift.domain.TierTally;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;

/** Reads of the order tables the gift pages need: statistics, the expected number of cases, the swap rule. */
@Repository
public class GiftQueries {

    private final JdbcTemplate jdbc;

    public GiftQueries(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** Cases per tier since {@code since}; REJECTED orders are left out: the gift was not really given. */
    public List<TierTally> tierTallies(Instant since) {
        return jdbc.query("""
                select o.gift_tier tier,
                       coalesce(sum(o.gift_case_status is not null), 0) cases,
                       coalesce(sum(o.gift_case_status = 'OPENED'), 0) opened,
                       coalesce(sum(o.gift_discount_minor > 0), 0) guaranteed
                  from orders o
                 where o.created_at >= ? and o.status <> 'REJECTED' and o.gift_tier is not null
                 group by o.gift_tier
                """, (rs, n) -> new TierTally(rs.getString("tier"), rs.getLong("cases"), rs.getLong("opened"),
                rs.getLong("guaranteed")), Timestamp.from(since));
    }

    public GiftTally tally(Instant since) {
        return jdbc.queryForObject("""
                select count(*) orders,
                       coalesce(sum(exists(select 1 from order_items i where i.order_id = o.id and i.auto_gift)), 0) gift_orders,
                       coalesce(sum(o.gift_case_status is not null), 0) case_orders,
                       coalesce(sum(o.gift_case_status = 'OPENED'), 0) cases_opened,
                       coalesce(sum(o.gift_discount_minor > 0), 0) guaranteed_orders,
                       coalesce(sum(o.gift_discount_minor), 0) guaranteed_minor,
                       coalesce(sum(exists(select 1 from order_gift_cases g where g.order_id = o.id and g.swapped_at is not null)), 0) swaps,
                       coalesce(sum(exists(select 1 from order_gift_cases g where g.order_id = o.id and g.kind = 'DISCOUNT')), 0) discount_prizes
                  from orders o
                 where o.created_at >= ? and o.status <> 'REJECTED'
                """, (rs, n) -> new GiftTally(rs.getLong("orders"), rs.getLong("gift_orders"),
                rs.getLong("case_orders"), rs.getLong("cases_opened"), rs.getLong("guaranteed_orders"),
                rs.getLong("guaranteed_minor"), rs.getLong("swaps"), rs.getLong("discount_prizes")),
                Timestamp.from(since));
    }

    /** Not rejected orders since {@code since} whose total is in {@code [fromMinor, toMinor)}. */
    public long countOrdersByTotal(Instant since, long fromMinor, long toMinor) {
        Long n = jdbc.queryForObject("select count(*) from orders where created_at >= ? and status <> 'REJECTED' "
                + "and total_minor >= ? and total_minor < ?", Long.class, Timestamp.from(since), fromMinor, toMinor);
        return n == null ? 0 : n;
    }

    /**
     * Has the customer already bought something similar to the prize: the same product or one of the same
     * category, in this order or any other order of theirs (gifts and rejected orders do not count).
     */
    public boolean similarBought(byte[] prizeProductId, byte[] orderId, Long userId) {
        Boolean found = jdbc.queryForObject("""
                select exists(
                  select 1
                    from order_items i
                    join orders o on o.id = i.order_id
                    join products p on p.id = i.product_id
                    join products q on q.id = ?
                   where (o.id = ? or (? is not null and o.user_id = ?))
                     and o.status <> 'REJECTED'
                     and i.gift = 0
                     and (i.product_id = q.id or (p.category_id is not null and p.category_id = q.category_id)))
                """, Boolean.class, prizeProductId, orderId, userId, userId);
        return Boolean.TRUE.equals(found);
    }
}
