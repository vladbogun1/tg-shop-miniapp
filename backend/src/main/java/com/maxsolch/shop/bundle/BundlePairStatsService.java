package com.maxsolch.shop.bundle;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Which top categories are bought together: orders of the last {@link #WINDOW} (not REJECTED), counted
 * once per order. Recomputed at most every {@link #TTL} — a few hundred orders, one query.
 */
@Service
public class BundlePairStatsService {

    public static final Duration WINDOW = Duration.ofDays(180);
    static final Duration TTL = Duration.ofHours(6);

    private final JdbcTemplate jdbc;
    private volatile BundlePairStats cached;
    private volatile Instant cachedAt = Instant.EPOCH;

    public BundlePairStatsService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public BundlePairStats current() {
        BundlePairStats c = cached;
        if (c != null && cachedAt.plus(TTL).isAfter(Instant.now())) {
            return c;
        }
        synchronized (this) {
            if (cached == null || !cachedAt.plus(TTL).isAfter(Instant.now())) {
                try {
                    cached = load();
                } catch (RuntimeException e) {
                    // The storefront keeps working on neutral pair weights.
                    if (cached == null) {
                        cached = BundlePairStats.EMPTY;
                    }
                }
                cachedAt = Instant.now();
            }
            return cached;
        }
    }

    public void invalidate() {
        cachedAt = Instant.EPOCH;
    }

    private BundlePairStats load() {
        // The tree is two levels at most: the top category is the parent or the category itself.
        List<Object[]> rows = jdbc.query("""
                select distinct hex(oi.order_id) oid, hex(coalesce(c.parent_id, c.id)) top
                  from order_items oi
                  join orders o on o.id = oi.order_id
                  join products p on p.id = oi.product_id
                  join categories c on c.id = p.category_id
                 where o.created_at >= ? and o.status <> 'REJECTED' and oi.gift = false
                """, (rs, n) -> new Object[]{rs.getString("oid"), rs.getString("top")},
                Timestamp.from(Instant.now().minus(WINDOW)));
        Map<String, Set<String>> byOrder = new HashMap<>();
        for (Object[] r : rows) {
            byOrder.computeIfAbsent((String) r[0], k -> new HashSet<>()).add(uuid((String) r[1]));
        }
        Map<String, Integer> anchor = new HashMap<>();
        Map<String, Map<String, Integer>> together = new HashMap<>();
        for (Set<String> tops : byOrder.values()) {
            for (String a : tops) {
                anchor.merge(a, 1, Integer::sum);
                for (String b : tops) {
                    if (!a.equals(b)) {
                        together.computeIfAbsent(a, k -> new HashMap<>()).merge(b, 1, Integer::sum);
                    }
                }
            }
        }
        return new BundlePairStats(byOrder.size(), anchor, together);
    }

    /** HEX(BINARY(16)) → the dashed form UuidUtil.toString gives. */
    static String uuid(String hex) {
        String h = hex.toLowerCase();
        return h.substring(0, 8) + "-" + h.substring(8, 12) + "-" + h.substring(12, 16) + "-"
                + h.substring(16, 20) + "-" + h.substring(20);
    }
}
