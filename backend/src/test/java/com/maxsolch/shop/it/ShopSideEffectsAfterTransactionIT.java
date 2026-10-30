package com.maxsolch.shop.it;

import com.maxsolch.shop.promo.app.PromoSettings;
import com.maxsolch.shop.journal.app.ActivityLog;
import com.maxsolch.shop.settings.app.SettingsService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.time.Duration;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

/**
 * What happens to the journal and to the settings snapshot around a transaction, against real MySQL:
 * a journal row of a rolled-back transaction must never appear (a rolled-back payment is not "done"), and the
 * settings snapshot must be dropped after a rollback as well (it may hold values that were never committed).
 */
class ShopSideEffectsAfterTransactionIT extends AbstractMysqlIT {

    @Autowired
    ActivityLog activity;
    @Autowired
    SettingsService settings;

    private int rows(String type) {
        Integer n = jdbc.queryForObject("SELECT COUNT(*) FROM activity_log WHERE type = ?", Integer.class, type);
        return n == null ? 0 : n;
    }

    @Test
    void journalRowOfACommittedTransactionAppearsAfterTheCommit() {
        String type = "IT_C_" + UUID.randomUUID().toString().substring(0, 8);

        tx.executeWithoutResult(s -> {
            activity.recordAfterCommit(ActivityLog.Entry.of(ActivityLog.SYSTEM, type));
            assertThat(rows(type)).as("not before the commit").isZero();
        });

        await().atMost(Duration.ofSeconds(10)).untilAsserted(() -> assertThat(rows(type)).isEqualTo(1));
    }

    @Test
    void journalRowOfARolledBackTransactionNeverAppears() {
        String lost = "IT_R_" + UUID.randomUUID().toString().substring(0, 8);
        String sentinel = "IT_S_" + UUID.randomUUID().toString().substring(0, 8);

        tx.executeWithoutResult(s -> {
            activity.recordAfterCommit(ActivityLog.Entry.of(ActivityLog.SYSTEM, lost));
            s.setRollbackOnly();
        });
        // one worker writes in order: once the sentinel (queued later) is in, an earlier entry would be in too
        activity.record(ActivityLog.Entry.of(ActivityLog.SYSTEM, sentinel));
        await().atMost(Duration.ofSeconds(10)).untilAsserted(() -> assertThat(rows(sentinel)).isEqualTo(1));

        assertThat(rows(lost)).isZero();
    }

    @Test
    void outsideATransactionTheRowIsQueuedRightAway() {
        String type = "IT_N_" + UUID.randomUUID().toString().substring(0, 8);

        activity.recordAfterCommit(ActivityLog.Entry.of(ActivityLog.SYSTEM, type));

        await().atMost(Duration.ofSeconds(10)).untilAsserted(() -> assertThat(rows(type)).isEqualTo(1));
    }

    @Test
    void settingsSnapshotIsDroppedAfterARollbackToo() {
        String key = PromoSettings.PROMO_HOLD_MINUTES;
        int before = settings.get(key, 30);
        int changed = before == 77 ? 78 : 77;

        tx.executeWithoutResult(s -> {
            settings.update(Map.of(key, changed));
            // a read inside the transaction caches the uncommitted value
            assertThat(settings.get(key, 30)).isEqualTo(changed);
            s.setRollbackOnly();
        });

        assertThat(settings.get(key, 30)).as("the rolled-back value must not stay cached").isEqualTo(before);
    }
}
