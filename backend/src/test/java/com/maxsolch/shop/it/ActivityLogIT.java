package com.maxsolch.shop.it;

import com.maxsolch.shop.platform.journal.ActivityLogStore;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The «Бот и сайт» feed answers what the SQL with {@code LEFT JOIN users} used to answer (before the names moved behind the
 * journal's {@code JournalPeople} port, step 9e): the old statement is the oracle for every search.
 */
class ActivityLogIT extends AbstractMysqlIT {

    private static final long BASE = 9_300_000_000_000L;
    private static final String GROUP = "it-9e-feed";

    @Autowired
    ActivityLogStore store;

    @BeforeEach
    void data() {
        jdbc.update("DELETE FROM activity_log WHERE group_id = ?", GROUP);
        jdbc.update("DELETE FROM users WHERE telegram_user_id BETWEEN ? AND ?", BASE, BASE + 9);
        String[][] people = {{"vasya_100%", "Vasiliy", "Ivanov"}, {"petya", "Petro", null}, {null, null, "Sidorenko"},
                {"under_score", null, null}};
        for (int i = 0; i < people.length; i++) {
            jdbc.update("INSERT INTO users (telegram_user_id, username, first_name, last_name, created_at, last_seen_at, "
                    + "is_premium, bot_blocked) VALUES (?, ?, ?, ?, NOW(), NOW(), FALSE, FALSE)",
                    BASE + i + 1, people[i][0], people[i][1], people[i][2]);
        }
        for (int i = 0; i < 8; i++) {
            Long user = i < 5 ? BASE + (i % 4) + 1 : null;
            jdbc.update("INSERT INTO activity_log (created_at, source, type, result, recipient, tg_user_id, group_id, summary) "
                    + "VALUES (NOW() - INTERVAL ? SECOND, 'BOT', 'T', 'OK', 'CUSTOMER', ?, ?, ?)",
                    i, user, GROUP, i == 6 ? "about Vasiliy" : "row " + i);
        }
    }

    private List<Long> oracle(String q) {
        String like = "%" + q.trim().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%";
        return jdbc.query("SELECT a.id FROM activity_log a LEFT JOIN users u ON u.telegram_user_id = a.tg_user_id "
                        + "WHERE a.group_id = ? AND (a.summary LIKE ? OR a.error LIKE ? OR u.username LIKE ? OR u.first_name LIKE ? "
                        + "OR u.last_name LIKE ?) ORDER BY a.created_at DESC, a.id DESC",
                (rs, i) -> rs.getLong(1), GROUP, like, like, like, like, like);
    }

    @Test
    void searchByNameMatchesTheOldJoin() {
        for (String q : new String[]{"vas", "Ivan", "sidor", "100%", "100", "_", "under_", "under", "row", "nobody", "PETRO"}) {
            List<Long> got = store.search(filter(q), 0, 100).stream()
                    .filter(r -> GROUP.equals(r.groupId())).map(ActivityLogStore.Row::id).toList();
            assertThat(got).as("q=" + q).isEqualTo(oracle(q));
        }
    }

    @Test
    void rowsCarryTheCustomerName() {
        List<ActivityLogStore.Row> rows = store.search(new ActivityLogStore.Filter(null, null, null, null, null, null,
                GROUP, null, null, null, null), 0, 100);
        assertThat(rows).hasSize(8);
        ActivityLogStore.Row first = rows.stream().filter(r -> r.tgUserId() != null && r.tgUserId() == BASE + 1).findFirst()
                .orElseThrow();
        assertThat(first.customerName()).isEqualTo("Vasiliy Ivanov");
        assertThat(first.customerUsername()).isEqualTo("vasya_100%");
        assertThat(rows.stream().filter(r -> r.tgUserId() != null && r.tgUserId() == BASE + 3).findFirst().orElseThrow()
                .customerName()).isEqualTo("Sidorenko");
        assertThat(rows.stream().filter(r -> r.tgUserId() == null).allMatch(r -> r.customerName() == null)).isTrue();
        assertThat(store.countByResult(filter("vas"))).isNotEmpty();
    }

    private static ActivityLogStore.Filter filter(String q) {
        return new ActivityLogStore.Filter(null, null, null, null, null, null, GROUP, null, q, null, null);
    }
}
