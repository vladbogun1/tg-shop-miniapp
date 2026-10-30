package com.maxsolch.shop.analytics.infra;

import com.maxsolch.shop.analytics.domain.MetricsFacts;
import com.maxsolch.shop.order.domain.OrderStatus;
import com.maxsolch.shop.platform.cache.CacheConfig;
import org.springframework.cache.Cache;
import org.springframework.cache.CacheManager;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Plain SQL that reads the rows the metrics are computed from (one query per table, no entities, no lazy
 * loading).
 *
 * <p>Columns that another work package adds ({@code orders.refunded_minor}, {@code returned_at},
 * {@code reject_reason_code}) are probed once in {@code information_schema}: until the migration
 * that adds them is deployed they read as 0/null instead of breaking the page. The same goes for
 * the online-payment columns and {@code payment_invoices} (V39).
 */
@Repository
public class MetricsFactsQueries {

    private final JdbcTemplate jdbc;
    private final Cache schemaFacts;

    public MetricsFactsQueries(JdbcTemplate jdbc, CacheManager caches) {
        this.jdbc = jdbc;
        this.schemaFacts = CacheConfig.require(caches, AnalyticsCaches.SCHEMA_FACTS);
    }

    /** Read-through over the schema cache: a failed lookup is not remembered. */
    private boolean schemaFact(String key, java.util.function.Supplier<Boolean> lookup) {
        Boolean known = schemaFacts.get(key, Boolean.class);
        if (known == null) {
            known = lookup.get();
            schemaFacts.put(key, known);
        }
        return known;
    }

    /** Whether {@code orders.<column>} exists (cached; columns only appear with a redeploy). */
    public boolean hasOrderColumn(String column) {
        return schemaFact("column:" + column, () -> {
            Integer n = jdbc.queryForObject(
                    "select count(*) from information_schema.columns "
                            + "where table_schema = database() and table_name = 'orders' and column_name = ?",
                    Integer.class, column);
            return n != null && n > 0;
        });
    }

    /** Whether {@code payment_invoices} exists (V39, online payments). */
    public boolean hasInvoices() {
        return schemaFact("table:payment_invoices", () -> {
            Integer n = jdbc.queryForObject(
                    "select count(*) from information_schema.tables "
                            + "where table_schema = database() and table_name = 'payment_invoices'",
                    Integer.class);
            return n != null && n > 0;
        });
    }

    public List<MetricsFacts.OrderFact> loadOrders() {
        String refunded = hasOrderColumn("refunded_minor") ? "o.refunded_minor" : "0";
        String returnedAt = hasOrderColumn("returned_at") ? "o.returned_at" : "null";
        String reasonCode = hasOrderColumn("reject_reason_code") ? "o.reject_reason_code" : "null";
        String prepayment = hasOrderColumn("prepayment_minor") ? "o.prepayment_minor" : "0";
        String dueAt = hasOrderColumn("payment_due_at") ? "o.payment_due_at" : "null";
        String uncollected = hasOrderColumn("uncollected_minor") ? "o.uncollected_minor" : "0";
        boolean invoices = hasInvoices();
        // Credited monobank invoices per order: how much came online, when, and the last refund.
        String online = invoices
                ? "left join (select order_id, sum(amount_minor) online_paid_minor, min(applied_at) online_paid_at, "
                + "max(case when refunded_minor > 0 then updated_at end) online_refund_at "
                + "from payment_invoices where applied_at is not null group by order_id) pi on pi.order_id = o.id "
                : "";
        String sql = "select bin_to_uuid(o.id) id, o.status, o.source, o.total_minor, o.subtotal_minor, "
                + "o.discount_minor, o.received_minor, " + refunded + " refunded_minor, "
                + "o.created_at, o.approved_at, o.shipped_at, o.delivered_at, o.rejected_at, o.paid_at, "
                + returnedAt + " returned_at, o.paid, o.tg_user_id, o.customer_name, "
                + "o.tg_username, o.delivery_method, o.payment_option_title, o.promo_code, o.reject_reason, "
                + reasonCode + " reject_reason_code, " + prepayment + " prepayment_minor, "
                + dueAt + " payment_due_at, "
                + (invoices ? "coalesce(pi.online_paid_minor, 0)" : "0") + " online_paid_minor, "
                + (invoices ? "pi.online_paid_at" : "null") + " online_paid_at, "
                + (invoices ? "pi.online_refund_at" : "null") + " online_refund_at, "
                + uncollected + " uncollected_minor "
                + "from orders o " + online
                // A merged order (V71) is not an order of its own: its lines live on in the one it joined.
                + (hasOrderColumn("reject_reason_code") ? "where coalesce(o.reject_reason_code, '') <> 'MERGED' " : "")
                + "order by o.created_at";
        return jdbc.query(sql, (rs, i) -> new MetricsFacts.OrderFact(
                rs.getString("id"),
                OrderStatus.valueOf(rs.getString("status")),
                rs.getString("source"),
                rs.getLong("total_minor"),
                rs.getLong("subtotal_minor"),
                rs.getLong("discount_minor"),
                rs.getLong("received_minor"),
                rs.getLong("refunded_minor"),
                ts(rs, "created_at"),
                ts(rs, "approved_at"),
                ts(rs, "shipped_at"),
                ts(rs, "delivered_at"),
                ts(rs, "rejected_at"),
                ts(rs, "paid_at"),
                ts(rs, "returned_at"),
                rs.getBoolean("paid"),
                nullableLong(rs, "tg_user_id"),
                rs.getString("customer_name"),
                rs.getString("tg_username"),
                rs.getString("delivery_method"),
                rs.getString("payment_option_title"),
                rs.getString("promo_code"),
                rs.getString("reject_reason"),
                rs.getString("reject_reason_code"),
                rs.getLong("prepayment_minor"),
                ts(rs, "payment_due_at"),
                rs.getLong("online_paid_minor"),
                ts(rs, "online_paid_at"),
                ts(rs, "online_refund_at"),
                rs.getLong("uncollected_minor")));
    }

    public List<MetricsFacts.InvoiceFact> loadInvoices() {
        if (!hasInvoices()) {
            return List.of();
        }
        return jdbc.query("select bin_to_uuid(i.order_id) order_id, i.status, i.amount_minor, i.refunded_minor, "
                        + "i.fee_minor, i.created_at, i.applied_at, i.updated_at from payment_invoices i "
                        + "order by i.created_at",
                (rs, i) -> new MetricsFacts.InvoiceFact(
                        rs.getString("order_id"),
                        rs.getString("status"),
                        rs.getLong("amount_minor"),
                        rs.getLong("refunded_minor"),
                        rs.getLong("fee_minor"),
                        ts(rs, "created_at"),
                        ts(rs, "applied_at"),
                        ts(rs, "updated_at")));
    }

    public List<MetricsFacts.ItemFact> loadItems() {
        return jdbc.query("select bin_to_uuid(it.order_id) order_id, bin_to_uuid(it.product_id) product_id, "
                        + "bin_to_uuid(it.variant_id) variant_id, it.title_snapshot, it.variant_name_snapshot, "
                        + "it.price_minor_snapshot, it.quantity, it.gift, it.returned_qty from order_items it",
                (rs, i) -> new MetricsFacts.ItemFact(
                        rs.getString("order_id"),
                        rs.getString("product_id"),
                        rs.getString("variant_id"),
                        rs.getString("title_snapshot"),
                        rs.getString("variant_name_snapshot"),
                        rs.getLong("price_minor_snapshot"),
                        rs.getInt("quantity"),
                        rs.getBoolean("gift"),
                        rs.getInt("returned_qty")));
    }

    public List<MetricsFacts.ProductFact> loadProducts() {
        Map<String, List<String>> tags = new HashMap<>();
        // Catalog v2: the ROOT category of the product's category, one per product (no double counting).
        jdbc.query("select bin_to_uuid(p.id) pid, coalesce(r.name, c.name) name from products p "
                        + "join categories c on c.id = p.category_id left join categories r on r.id = c.parent_id",
                rs -> {
                    tags.computeIfAbsent(rs.getString("pid"), k -> new ArrayList<>()).add(rs.getString("name"));
                });
        Map<String, List<MetricsFacts.VariantFact>> variants = new HashMap<>();
        jdbc.query("select bin_to_uuid(v.id) id, bin_to_uuid(v.product_id) pid, v.name, v.stock "
                        + "from product_variants v order by v.sort_order",
                rs -> {
                    variants.computeIfAbsent(rs.getString("pid"), k -> new ArrayList<>())
                            .add(new MetricsFacts.VariantFact(rs.getString("id"), rs.getString("name"),
                                    rs.getInt("stock")));
                });
        return jdbc.query("select bin_to_uuid(p.id) id, p.title, p.price_minor, p.stock, p.active, p.archived, "
                        + "p.created_at from products p",
                (rs, i) -> {
                    String id = rs.getString("id");
                    return new MetricsFacts.ProductFact(id,
                            rs.getString("title"),
                            rs.getLong("price_minor"),
                            rs.getInt("stock"),
                            rs.getBoolean("active"),
                            rs.getBoolean("archived"),
                            ts(rs, "created_at"),
                            tags.getOrDefault(id, List.of()),
                            variants.getOrDefault(id, List.of()));
                });
    }

    public List<MetricsFacts.UserFact> loadUsers() {
        return jdbc.query("select telegram_user_id, created_at from users",
                (rs, i) -> new MetricsFacts.UserFact(rs.getLong(1), ts(rs, "created_at")));
    }

    private static Instant ts(ResultSet rs, String column) throws SQLException {
        Timestamp t = rs.getTimestamp(column);
        return t == null ? null : t.toInstant();
    }

    private static Long nullableLong(ResultSet rs, String column) throws SQLException {
        long v = rs.getLong(column);
        return rs.wasNull() ? null : v;
    }
}
