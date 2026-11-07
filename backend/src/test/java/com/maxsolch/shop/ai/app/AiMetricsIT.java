package com.maxsolch.shop.ai.app;

import com.maxsolch.shop.it.AbstractMysqlIT;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The AI metrics on a real MySQL with seeded jobs of March 2020 (nothing else writes there): the money by day, the
 * share of the built-in way, the money in vain, the test admin left out by default, the bounds of the period.
 * 47 619 micro-USD at 42 UAH are exactly 2.00 UAH.
 */
class AiMetricsIT extends AbstractMysqlIT {

    private static final long TEST_ADMIN = AiMetrics.TEST_ADMIN;
    private static final String FROM = "2020-03-01";
    private static final String TO = "2020-03-31";

    @Autowired
    AiMetrics metrics;

    @AfterEach
    void clean() {
        jdbc.update("delete from ai_jobs where created_at >= '2020-01-01' and created_at < '2020-06-01'");
    }

    @BeforeEach
    void seed() {
        clean();
        job("CARD", "DONE", "BUILTIN", 1L, "2020-03-10T10:00:00Z", "APPLIED", 10, 0, null);
        job("CARD", "DONE", "BUILTIN", 1L, "2020-03-10T11:00:00Z", "PARTIAL", 6, 4, null);
        job("CARD", "EMPTY", "BUILTIN", 1L, "2020-03-11T10:00:00Z", null, null, null, null);
        job("CARD", "DONE", "MANUAL", 1L, "2020-03-11T12:00:00Z", "APPLIED", 0, 0, "CHOICE");
        job("CARD", "DONE", "BUILTIN", TEST_ADMIN, "2020-03-11T13:00:00Z", "APPLIED", 5, 0, null);
        job("CARD", "DONE", "BUILTIN", 1L, "2020-04-02T10:00:00Z", "APPLIED", 5, 0, null); // outside the period
    }

    private void job(String feature, String status, String path, long admin, String at, String outcome,
                     Integer applied, Integer rejected, String errorCode) {
        Timestamp t = Timestamp.from(Instant.parse(at));
        boolean manual = "MANUAL".equals(path);
        jdbc.update("""
                insert into ai_jobs (feature, status, admin_id, subject_type, subject_id, effort, path, cost_micro_usd,
                  rate_milli, error_code, outcome, outcome_applied, outcome_rejected, outcome_edited, outcome_at,
                  created_at, finished_at)
                values (?, ?, ?, 'PRODUCT', ?, 'low', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, feature, status, admin, "it-" + UUID.randomUUID().toString().substring(0, 12), path,
                manual ? 0 : 47_619, manual ? 0 : 42_000, errorCode, outcome, applied, rejected,
                outcome == null ? null : 0, outcome == null ? null : t, t, t);
    }

    @Test
    void theMonthSumsMoneyAcceptedShareAndWaste() {
        var s = metrics.summary(FROM, TO, false);

        // 3 built-in jobs of 2.00 UAH (the test admin's and the April one are out)
        assertThat(s.spentMinor()).isEqualTo(600);
        assertThat(s.accepted()).isEqualTo(2);
        assertThat(s.share().builtin()).isEqualTo(2);
        assertThat(s.share().manual()).isEqualTo(1);
        assertThat(s.share().manualBy()).containsEntry("CHOICE", 1L);
        assertThat(s.wastedMinor()).isEqualTo(200);
    }

    @Test
    void theTestAdminIsCountedOnlyWhenAsked() {
        assertThat(metrics.summary(FROM, TO, true).spentMinor()).isEqualTo(800);
        assertThat(metrics.summary(FROM, TO, true).accepted()).isEqualTo(3);
    }

    @Test
    void theChartHasADayForEachDateAndMoneyOnTheRightOnes() {
        var rows = metrics.series("day", FROM, TO, false).rows();

        assertThat(rows).hasSize(31);
        assertThat(rows).filteredOn(r -> r.key().equals("2020-03-10")).singleElement()
                .satisfies(r -> assertThat(r.costMinor()).isEqualTo(400));
        assertThat(rows).filteredOn(r -> r.key().equals("2020-03-11")).singleElement()
                .satisfies(r -> assertThat(r.costMinor()).isEqualTo(200));
        assertThat(rows.stream().mapToLong(r -> r.costMinor()).sum()).isEqualTo(600);
    }
}
