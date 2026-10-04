package com.maxsolch.shop.analytics.metrics;

import com.maxsolch.shop.domain.OrderStatus;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Loads {@link MetricsFacts} with plain SQL (one query per table, no entities, no lazy loading).
 *
 * <p>Columns that another work package adds ({@code orders.refunded_minor}, {@code returned_at},
 * {@code reject_reason_code}) are probed once in {@code information_schema}: until the migration
 * that adds them is deployed they read as 0/null instead of breaking the page.
 *
 * <p>The snapshot is memoised for a few seconds: the metrics page fires several tab requests at
 * once and the board's "Today" strip polls, all reading the same rows.
 */
@Slf4j
@Component
public class MetricsFactsLoader {

    private static final long MEMO_MILLIS = 15_000;

    private final JdbcTemplate jdbc;
    private final Map<String, Boolean> columnCache = new ConcurrentHashMap<>();
    private volatile MetricsFacts memo;
    private volatile long memoAt;

    public MetricsFactsLoader(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Transactional(readOnly = true)
    public MetricsFacts load() {
        long nowMs = System.currentTimeMillis();
        MetricsFacts cached = memo;
        if (cached != null && nowMs - memoAt < MEMO_MILLIS) {
            return new MetricsFacts(cached.orders(), cached.items(), cached.products(), cached.users(),
                    Instant.now());
        }
        MetricsFacts fresh = new MetricsFacts(loadOrders(), loadItems(), loadProducts(), loadUsers(),
                Instant.now());
        memo = fresh;
        memoAt = nowMs;
        return fresh;
    }

    /** Whether {@code orders.<column>} exists (cached; columns only appear with a redeploy). */
    boolean hasOrderColumn(String column) {
        return columnCache.computeIfAbsent(column, c -> {
            Integer n = jdbc.queryForObject(
                    "select count(*) from information_schema.columns "
                            + "where table_schema = database() and table_name = 'orders' and column_name = ?",
                    Integer.class, c);
            return n != null && n > 0;
        });
    }

    private List<MetricsFacts.OrderFact> loadOrders() {
        String refunded = hasOrderColumn("refunded_minor") ? "o.refunded_minor" : "0";
        String returnedAt = hasOrderColumn("returned_at") ? "o.returned_at" : "null";
        String reasonCode = hasOrderColumn("reject_reason_code") ? "o.reject_reason_code" : "null";
        String sql = "select bin_to_uuid(o.id) id, o.status, o.source, o.total_minor, o.subtotal_minor, "
                + "o.discount_minor, o.received_minor, " + refunded + " refunded_minor, "
                + "o.created_at, o.approved_at, o.shipped_at, o.delivered_at, o.rejected_at, o.paid_at, "
                + returnedAt + " returned_at, o.paid, o.payment_claimed, o.tg_user_id, o.customer_name, "
                + "o.tg_username, o.delivery_method, o.payment_option_title, o.promo_code, o.reject_reason, "
                + reasonCode + " reject_reason_code "
                + "from orders o order by o.created_at";
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
                rs.getBoolean("payment_claimed"),
                nullableLong(rs, "tg_user_id"),
                rs.getString("customer_name"),
                rs.getString("tg_username"),
                rs.getString("delivery_method"),
                rs.getString("payment_option_title"),
                rs.getString("promo_code"),
                rs.getString("reject_reason"),
                rs.getString("reject_reason_code")));
    }

    private List<MetricsFacts.ItemFact> loadItems() {
        return jdbc.query("select bin_to_uuid(it.order_id) order_id, bin_to_uuid(it.product_id) product_id, "
                        + "bin_to_uuid(it.variant_id) variant_id, it.title_snapshot, it.variant_name_snapshot, "
                        + "it.price_minor_snapshot, it.quantity, it.gift from order_items it",
                (rs, i) -> new MetricsFacts.ItemFact(
                        rs.getString("order_id"),
                        rs.getString("product_id"),
                        rs.getString("variant_id"),
                        rs.getString("title_snapshot"),
                        rs.getString("variant_name_snapshot"),
                        rs.getLong("price_minor_snapshot"),
                        rs.getInt("quantity"),
                        rs.getBoolean("gift")));
    }

    private List<MetricsFacts.ProductFact> loadProducts() {
        Map<String, List<String>> tags = new HashMap<>();
        jdbc.query("select bin_to_uuid(pt.product_id) pid, t.name from product_tags pt "
                        + "join tags t on t.id = pt.tag_id order by t.sort_order, t.name",
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

    private List<MetricsFacts.UserFact> loadUsers() {
        return jdbc.query("select telegram_user_id, created_at from users",
                (rs, i) -> new MetricsFacts.UserFact(rs.getLong(1), ts(rs, "created_at")));
    }

    static Instant ts(ResultSet rs, String column) throws SQLException {
        Timestamp t = rs.getTimestamp(column);
        return t == null ? null : t.toInstant();
    }

    private static Long nullableLong(ResultSet rs, String column) throws SQLException {
        long v = rs.getLong(column);
        return rs.wasNull() ? null : v;
    }
}
