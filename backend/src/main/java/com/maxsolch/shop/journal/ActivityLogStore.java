package com.maxsolch.shop.journal;

import com.maxsolch.shop.common.UuidUtil;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * Reads of {@code activity_log} for the admin «Журнал → Бот и сайт» tab: the filtered feed, filter
 * values, the per-broadcast delivery breakdown and the 24 h counters; plus the retention purge.
 * Plain SQL — every filter is optional and the customer's name comes from {@code users}.
 */
@Repository
public class ActivityLogStore {

    private static final Pattern UUID_FULL = Pattern.compile("[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}");
    private static final Pattern UUID_SHORT = Pattern.compile("#?[0-9a-fA-F]{8}");

    private final JdbcTemplate jdbc;

    public ActivityLogStore(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** Filters of the feed; null = any. */
    public record Filter(String source, String type, String result, String recipient, Long tgUserId,
                         String order, String group, String errorCode, String q, Instant from, Instant to) {
    }

    /** One row of the feed. */
    public record Row(long id, Instant createdAt, String source, String type, String result, String recipient,
                      Long tgUserId, String customerName, String customerUsername, Long chatId, String orderId,
                      String groupId, String summary, String errorCode, String error, String details) {
    }

    /** One SQL condition list + its parameters. */
    record Where(String sql, List<Object> params) {
    }

    static Where where(Filter f) {
        StringBuilder sql = new StringBuilder(" WHERE 1=1");
        List<Object> p = new ArrayList<>();
        if (f.source() != null) {
            sql.append(" AND a.source = ?");
            p.add(f.source());
        }
        if (f.type() != null) {
            sql.append(" AND a.type = ?");
            p.add(f.type());
        }
        if (f.result() != null) {
            sql.append(" AND a.result = ?");
            p.add(f.result());
        }
        if (f.recipient() != null) {
            sql.append(" AND a.recipient = ?");
            p.add(f.recipient());
        }
        if (f.tgUserId() != null) {
            sql.append(" AND a.tg_user_id = ?");
            p.add(f.tgUserId());
        }
        if (f.errorCode() != null) {
            sql.append(" AND a.error_code = ?");
            p.add(f.errorCode());
        }
        if (f.group() != null) {
            sql.append(" AND a.group_id = ?");
            p.add(f.group());
        }
        if (f.order() != null) {
            String o = f.order().trim();
            if (UUID_FULL.matcher(o).matches()) {
                sql.append(" AND a.order_id = ?");
                p.add(UuidUtil.toBytes(o));
            } else if (UUID_SHORT.matcher(o).matches()) {
                // the short "#1a2b3c4d" customers and admins see everywhere
                sql.append(" AND a.order_id IS NOT NULL AND HEX(a.order_id) LIKE ?");
                p.add(o.replace("#", "").toUpperCase(Locale.ROOT) + "%");
            } else {
                sql.append(" AND 1=0");
            }
        }
        if (f.q() != null) {
            String q = f.q().trim();
            String like = "%" + q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%";
            sql.append(" AND (a.summary LIKE ? OR a.error LIKE ? OR u.username LIKE ? OR u.first_name LIKE ?"
                    + " OR u.last_name LIKE ?");
            p.add(like);
            p.add(like);
            p.add(like);
            p.add(like);
            p.add(like);
            if (q.matches("\\d{3,19}")) {
                sql.append(" OR a.tg_user_id = ?");
                p.add(Long.parseLong(q));
            }
            sql.append(')');
        }
        if (f.from() != null) {
            sql.append(" AND a.created_at >= ?");
            p.add(Timestamp.from(f.from()));
        }
        if (f.to() != null) {
            sql.append(" AND a.created_at < ?");
            p.add(Timestamp.from(f.to()));
        }
        return new Where(sql.toString(), p);
    }

    public List<Row> search(Filter f, int page, int size) {
        Where w = where(f);
        List<Object> params = new ArrayList<>(w.params());
        params.add(size);
        params.add((long) page * size);
        return jdbc.query("SELECT a.id, a.created_at, a.source, a.type, a.result, a.recipient, a.tg_user_id, "
                        + "a.chat_id, a.order_id, a.group_id, a.summary, a.error_code, a.error, a.details, "
                        + "u.first_name, u.last_name, u.username "
                        + "FROM activity_log a LEFT JOIN users u ON u.telegram_user_id = a.tg_user_id"
                        + w.sql() + " ORDER BY a.created_at DESC, a.id DESC LIMIT ? OFFSET ?",
                (rs, i) -> row(rs), params.toArray());
    }

    /** Totals of the current filter by result: {OK: n, FAILED: n, SKIPPED: n}. */
    public Map<String, Long> countByResult(Filter f) {
        Where w = where(f);
        Map<String, Long> out = new LinkedHashMap<>();
        jdbc.query("SELECT a.result, COUNT(*) FROM activity_log a LEFT JOIN users u ON u.telegram_user_id = a.tg_user_id"
                        + w.sql() + " GROUP BY a.result",
                rs -> {
                    out.put(rs.getString(1), rs.getLong(2));
                }, w.params().toArray());
        return out;
    }

    private static Row row(ResultSet rs) throws SQLException {
        String first = rs.getString("first_name");
        String last = rs.getString("last_name");
        String name = ((first == null ? "" : first) + " " + (last == null ? "" : last)).trim();
        Timestamp at = rs.getTimestamp("created_at");
        return new Row(
                rs.getLong("id"),
                at == null ? null : at.toInstant(),
                rs.getString("source"),
                rs.getString("type"),
                rs.getString("result"),
                rs.getString("recipient"),
                (Long) rs.getObject("tg_user_id", Long.class),
                name.isEmpty() ? null : name,
                rs.getString("username"),
                (Long) rs.getObject("chat_id", Long.class),
                UuidUtil.toString(rs.getBytes("order_id")),
                rs.getString("group_id"),
                rs.getString("summary"),
                rs.getString("error_code"),
                rs.getString("error"),
                rs.getString("details"));
    }

    /** Values for the filter dropdowns: [source, type] pairs and the error codes seen. */
    public List<String[]> sourceTypes() {
        return jdbc.query("SELECT DISTINCT source, type FROM activity_log ORDER BY source, type",
                (rs, i) -> new String[]{rs.getString(1), rs.getString(2)});
    }

    public List<String> errorCodes() {
        return jdbc.queryForList("SELECT DISTINCT error_code FROM activity_log WHERE error_code IS NOT NULL "
                + "ORDER BY error_code", String.class);
    }

    /** Last {@code since}: [source, result, count]. */
    public List<Object[]> countsSince(Instant since) {
        return jdbc.query("SELECT source, result, COUNT(*) FROM activity_log WHERE created_at >= ? GROUP BY source, result",
                (rs, i) -> new Object[]{rs.getString(1), rs.getString(2), rs.getLong(3)}, Timestamp.from(since));
    }

    /** Delivery breakdown of broadcasts: group id → (result|errorCode → count). */
    public Map<String, Map<String, Long>> groupBreakdown(List<String> groupIds) {
        Map<String, Map<String, Long>> out = new HashMap<>();
        if (groupIds.isEmpty()) {
            return out;
        }
        String in = String.join(",", java.util.Collections.nCopies(groupIds.size(), "?"));
        jdbc.query("SELECT group_id, result, error_code, COUNT(*) FROM activity_log WHERE group_id IN (" + in + ") "
                        + "GROUP BY group_id, result, error_code",
                rs -> {
                    String key = rs.getString(2) + (rs.getString(3) == null ? "" : "|" + rs.getString(3));
                    out.computeIfAbsent(rs.getString(1), k -> new LinkedHashMap<>())
                            .merge(key, rs.getLong(4), Long::sum);
                }, groupIds.toArray());
        return out;
    }

    /** Deletes rows older than {@code before}, in chunks so the table is never locked for long. */
    public int purgeBefore(Instant before) {
        int total = 0;
        for (int i = 0; i < 1000; i++) {
            int n = jdbc.update("DELETE FROM activity_log WHERE created_at < ? LIMIT 5000", Timestamp.from(before));
            total += n;
            if (n < 5000) {
                break;
            }
        }
        return total;
    }
}
