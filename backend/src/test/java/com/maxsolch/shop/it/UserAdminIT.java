package com.maxsolch.shop.it;

import com.maxsolch.shop.catalog.domain.Product;
import com.maxsolch.shop.customer.app.CustomerAudiences;
import com.maxsolch.shop.customer.app.UserAdminService;
import com.maxsolch.shop.customer.app.UserMetricsDto;
import com.maxsolch.shop.customer.domain.UserCardDto;
import com.maxsolch.shop.order.app.Checkout;
import com.maxsolch.shop.platform.time.TimeRange;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The admin users list, the metrics and the broadcast audiences answer exactly what the SQL that used to sit in the customer
 * module answered (before the orders part moved behind customer's {@code OrderHistory} port, step 9e). The old statements
 * are kept here as the oracle and compared over every sort, direction, search and filter.
 */
class UserAdminIT extends AbstractMysqlIT {

    private static final long BASE = 9_200_000_000_000L;

    @Autowired
    UserAdminService service;
    @Autowired
    CustomerAudiences audiences;
    @Autowired
    Checkout orders;

    @BeforeEach
    void data() {
        jdbc.update("DELETE FROM orders WHERE tg_user_id BETWEEN ? AND ?", BASE, BASE + 99);
        jdbc.update("DELETE FROM users WHERE telegram_user_id BETWEEN ? AND ?", BASE, BASE + 99);
        String[] names = {"ivan_a", "Ivan", null, "petya", "ivanka", "zed"};
        for (int i = 0; i < names.length; i++) {
            jdbc.update("INSERT INTO users (telegram_user_id, username, first_name, last_name, created_at, last_seen_at, "
                            + "is_premium, bot_blocked) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                    BASE + i + 1, names[i], "First" + i, i % 2 == 0 ? "Last" : null,
                    "2026-01-0" + (i + 1) + " 10:00:00", i == 2 ? null : "2026-02-0" + (6 - i) + " 10:00:00", i % 3 == 0,
                    i == 1 || i == 4);
        }
        Product p = product(10_000, 50);
        int[][] plan = {{1, 2}, {1, 1}, {2, 3}, {4, 1}, {4, 1}, {4, 2}};
        List<String> ids = new ArrayList<>();
        for (int[] o : plan) {
            ids.add(com.maxsolch.shop.platform.util.UuidUtil.toString(
                    orders.createOrder(checkout(BASE + o[0], "+3809900000" + o[0], p, o[1])).getId()));
        }
        // one of user 4's orders is rejected: it counts as an order, not as money spent
        jdbc.update("UPDATE orders SET status = 'REJECTED' WHERE id = ?",
                com.maxsolch.shop.platform.util.UuidUtil.toBytes(ids.get(5)));
    }

    private record Row(long id, long orders, long spent) {
    }

    private List<Row> oracle(String q, boolean blockedOnly, int page, int size, String sortBy, String dir) {
        String like = q == null ? "" : "%" + q.toLowerCase() + "%";
        String col = switch (sortBy) {
            case "lastSeenAt" -> "u.last_seen_at";
            case "username" -> "u.username";
            case "telegramUserId" -> "u.telegram_user_id";
            case "ordersCount" -> "ordersCount";
            case "totalSpentMinor" -> "totalSpentMinor";
            default -> "u.created_at";
        };
        String sql = "SELECT u.telegram_user_id, "
                + "(SELECT COUNT(*) FROM orders o WHERE o.tg_user_id = u.telegram_user_id) AS ordersCount, "
                + "(SELECT COALESCE(SUM(o.total_minor), 0) FROM orders o "
                + "   WHERE o.tg_user_id = u.telegram_user_id AND o.status <> 'REJECTED') AS totalSpentMinor "
                + "FROM users u WHERE (? = FALSE OR (LOWER(COALESCE(u.username, '')) LIKE ? "
                + "   OR LOWER(COALESCE(u.first_name, '')) LIKE ? OR LOWER(COALESCE(u.last_name, '')) LIKE ? "
                + "   OR CAST(u.telegram_user_id AS CHAR) LIKE ?)) AND (? = FALSE OR u.bot_blocked = TRUE) "
                + "ORDER BY " + col + " " + dir + ", u.telegram_user_id DESC LIMIT ? OFFSET ?";
        return jdbc.query(sql, (rs, i) -> new Row(rs.getLong(1), rs.getLong(2), rs.getLong(3)),
                q != null, like, like, like, like, blockedOnly, size, page * size);
    }

    @Test
    void listIsTheSameAsTheOldSqlForEverySortSearchAndPage() {
        int checked = 0;
        for (String sort : List.of("createdAt", "lastSeenAt", "username", "telegramUserId", "ordersCount", "totalSpentMinor", "unknown")) {
            for (String dir : List.of("asc", "desc")) {
                for (String q : new String[]{null, "ivan", "@Ivan", "92000000000"}) {
                    for (boolean blocked : new boolean[]{false, true}) {
                        for (int[] pg : new int[][]{{0, 100}, {0, 3}, {1, 3}}) {
                            String like = q == null ? null : q.startsWith("@") ? q.substring(1) : q;
                            List<Row> expected = oracle(like, blocked, pg[0], pg[1], sort, dir);
                            List<UserCardDto> got = service.list(q, blocked, pg[0], pg[1], sort, dir);
                            assertThat(got).as(sort + " " + dir + " q=" + q + " blocked=" + blocked + " page=" + pg[0] + "/" + pg[1])
                                    .extracting(UserCardDto::telegramUserId, UserCardDto::ordersCount, UserCardDto::totalSpentMinor)
                                    .containsExactlyElementsOf(expected.stream()
                                            .map(r -> org.assertj.core.groups.Tuple.tuple(r.id(), r.orders(), r.spent())).toList());
                            checked++;
                        }
                    }
                }
            }
        }
        assertThat(checked).isGreaterThan(300);
    }

    @Test
    void ordersAndSpentAreCountedThePreviousWay() {
        List<UserCardDto> mine = service.list("9200000000", false, 0, 100, "telegramUserId", "asc");
        assertThat(mine).extracting(UserCardDto::telegramUserId, UserCardDto::ordersCount, UserCardDto::totalSpentMinor)
                .contains(org.assertj.core.groups.Tuple.tuple(BASE + 1, 2L, 30_000L),
                        org.assertj.core.groups.Tuple.tuple(BASE + 4, 3L, 20_000L),
                        org.assertj.core.groups.Tuple.tuple(BASE + 3, 0L, 0L));
    }

    @Test
    void audiencesAreTheSameAsTheOldQueries() {
        Set<Long> reachable = new HashSet<>(jdbc.queryForList(
                "SELECT telegram_user_id FROM users WHERE telegram_user_id > 0 AND bot_blocked = FALSE", Long.class));
        Set<Long> ordered = new HashSet<>(jdbc.queryForList(
                "SELECT telegram_user_id FROM users u WHERE telegram_user_id > 0 AND bot_blocked = FALSE "
                        + "AND EXISTS (SELECT 1 FROM orders o WHERE o.tg_user_id = u.telegram_user_id)", Long.class));
        Set<Long> never = new HashSet<>(reachable);
        never.removeAll(ordered);
        assertThat(new HashSet<>(audiences.ids("active"))).isEqualTo(ordered);
        assertThat(new HashSet<>(audiences.ids("inactive"))).isEqualTo(never);
        assertThat(new HashSet<>(audiences.ids("all"))).isEqualTo(reachable);
        assertThat(audiences.count("active")).isEqualTo(ordered.size());
        assertThat(audiences.count("inactive")).isEqualTo(never.size());
        assertThat(audiences.count("all")).isEqualTo(reachable.size());
        assertThat(ordered).contains(BASE + 1, BASE + 4).doesNotContain(BASE + 3);
    }

    @Test
    void metricsCountCustomersAndTopSpendersThePreviousWay() {
        UserMetricsDto m = service.metrics(TimeRange.parse("all"));
        Long active = jdbc.queryForObject(
                "SELECT COUNT(DISTINCT tg_user_id) FROM orders WHERE tg_user_id IS NOT NULL AND tg_user_id > 0", Long.class);
        assertThat(m.activeUsers()).isEqualTo(active);
        List<List<Object>> expected = jdbc.query("SELECT tg_user_id, MAX(customer_name), COUNT(*), COALESCE(SUM(total_minor), 0) "
                        + "FROM orders WHERE tg_user_id IS NOT NULL AND tg_user_id > 0 AND status <> 'REJECTED' "
                        + "GROUP BY tg_user_id ORDER BY SUM(total_minor) DESC LIMIT 10",
                (rs, i) -> List.<Object>of(rs.getLong(1), rs.getString(2), rs.getLong(3), rs.getLong(4)));
        assertThat(m.topCustomers()).extracting(t -> t.totalSpentMinor()).containsExactlyElementsOf(
                expected.stream().map(r -> (Long) r.get(3)).toList());
        assertThat(m.topCustomers()).hasSize(expected.size());
    }
}
