package com.maxsolch.shop.finance.infra;

import com.maxsolch.shop.finance.domain.MarginRows.Alloc;
import com.maxsolch.shop.finance.domain.MarginRows.Bundle;
import com.maxsolch.shop.finance.domain.MarginRows.Invoice;
import com.maxsolch.shop.finance.domain.MarginRows.ItemRow;
import com.maxsolch.shop.finance.domain.MarginRows.OrderRow;
import com.maxsolch.shop.platform.util.UuidUtil;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/** SQL of the margin reports: orders with their lines, lot allocations and invoices, and the catalog names. */
@Repository
public class MarginQueries {

    private final NamedParameterJdbcTemplate jdbc;

    public MarginQueries(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** The given orders (by uuid string) with everything their profit needs, in the order they were found. */
    public Map<String, Bundle> bundles(Collection<String> orderIds) {
        Map<String, Bundle> out = new LinkedHashMap<>();
        if (orderIds.isEmpty()) {
            return out;
        }
        MapSqlParameterSource p = new MapSqlParameterSource("ids",
                orderIds.stream().map(UuidUtil::toBytes).toList());
        List<OrderRow> orders = jdbc.query("select bin_to_uuid(id) id, total_minor, refunded_minor, "
                + "uncollected_minor, status, payment_due_at is not null online, prepayment_minor "
                + "from orders where id in (:ids)", p, (rs, i) -> new OrderRow(
                rs.getString("id"), rs.getLong("total_minor"), rs.getLong("refunded_minor"),
                rs.getLong("uncollected_minor"), rs.getString("status"), rs.getBoolean("online"),
                rs.getLong("prepayment_minor")));
        List<ItemRow> items = jdbc.query("select id, bin_to_uuid(order_id) order_id, bin_to_uuid(product_id) pid, "
                + "bin_to_uuid(variant_id) vid, title_snapshot, variant_name_snapshot, price_minor_snapshot, quantity, "
                + "returned_qty, restocked_qty, gift from order_items where order_id in (:ids) order by id", p,
                MarginQueries::item);
        Map<Long, List<Alloc>> allocs = new HashMap<>();
        jdbc.query("select l.order_item_id, l.lot_id, l.qty, l.created_at from order_item_lots l "
                + "join order_items oi on oi.id = l.order_item_id where oi.order_id in (:ids) order by l.id", p,
                rs -> {
                    allocs.computeIfAbsent(rs.getLong(1), k -> new ArrayList<>())
                            .add(new Alloc(rs.getLong(1), rs.getLong(2), rs.getInt(3), ts(rs, 4)));
                });
        List<Invoice> invoices = jdbc.query("select bin_to_uuid(order_id) oid, amount_minor, fee_minor "
                + "from payment_invoices where order_id in (:ids) and applied_at is not null", p,
                (rs, i) -> new Invoice(rs.getString(1), rs.getLong(2), rs.getLong(3)));
        Map<String, List<ItemRow>> itemsBy = items.stream().collect(Collectors.groupingBy(ItemRow::orderId));
        Map<String, List<Invoice>> invBy = invoices.stream().collect(Collectors.groupingBy(Invoice::orderId));
        for (OrderRow o : orders) {
            List<ItemRow> its = itemsBy.getOrDefault(o.id(), List.of());
            Map<Long, List<Alloc>> a = new HashMap<>();
            its.forEach(i -> a.put(i.id(), allocs.getOrDefault(i.id(), List.of())));
            out.put(o.id(), new Bundle(o, its, a, invBy.getOrDefault(o.id(), List.of())));
        }
        return out;
    }

    /** Orders (uuid strings, not rejected) that took units from any of the given lots. */
    public List<String> orderIdsOfLots(Collection<Long> lotIds) {
        return jdbc.queryForList("select distinct bin_to_uuid(oi.order_id) from order_item_lots l "
                + "join order_items oi on oi.id = l.order_item_id join orders o on o.id = oi.order_id "
                + "where l.lot_id in (:lots) and o.status <> 'REJECTED'",
                new MapSqlParameterSource("lots", lotIds), String.class);
    }

    /** productId to {brand, category}, with a label for products that have none. */
    public Map<String, String[]> brandAndCategoryByProduct() {
        Map<String, String[]> m = new HashMap<>();
        jdbc.query("select bin_to_uuid(p.id), b.name, c.name from products p left join brands b on b.id = p.brand_id "
                + "left join categories c on c.id = p.category_id", rs -> {
                    m.put(rs.getString(1), new String[] {
                            rs.getString(2) == null ? "Без бренда" : rs.getString(2),
                            rs.getString(3) == null ? "Без категории" : rs.getString(3)});
                });
        return m;
    }

    private static ItemRow item(ResultSet rs, int i) throws SQLException {
        return new ItemRow(rs.getLong("id"), rs.getString("order_id"), rs.getString("pid"), rs.getString("vid"),
                rs.getString("title_snapshot"), rs.getString("variant_name_snapshot"),
                rs.getLong("price_minor_snapshot"), rs.getInt("quantity"), rs.getInt("returned_qty"),
                rs.getInt("restocked_qty"), rs.getBoolean("gift"));
    }

    private static Instant ts(ResultSet rs, int col) throws SQLException {
        Timestamp t = rs.getTimestamp(col);
        return t == null ? null : t.toInstant();
    }
}
