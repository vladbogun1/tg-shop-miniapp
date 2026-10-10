package com.maxsolch.shop.analytics.metrics;

import com.maxsolch.shop.web.BadRequestException;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.time.LocalDateTime;

import static com.maxsolch.shop.analytics.metrics.Fx.KYIV;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** Calendar periods are cut in Kyiv time and compared like for like. */
class MetricsPeriodTest {

    /** 2026-10-04 15:00 in Kyiv (UTC+3). */
    private final Instant now = LocalDateTime.parse("2026-10-04T15:00:00").atZone(KYIV).toInstant();

    private static Instant kyiv(String local) {
        return LocalDateTime.parse(local).atZone(KYIV).toInstant();
    }

    @Test
    void month_isMonthToDate_comparedWithSameSpanOfPreviousMonth() {
        MetricsPeriod p = MetricsPeriod.parse("month", null, null, KYIV, now);

        assertThat(p.from()).isEqualTo(kyiv("2026-10-01T00:00:00"));
        assertThat(p.to()).isEqualTo(now);
        assertThat(p.prevFrom()).isEqualTo(kyiv("2026-09-01T00:00:00"));
        // 3 days 15 hours into October -> the same 3 days 15 hours into September
        assertThat(p.prevTo()).isEqualTo(kyiv("2026-09-04T15:00:00"));
        assertThat(p.granularity()).isEqualTo(MetricsPeriod.Granularity.DAY);
    }

    @Test
    void month_previousSpanIsCappedAtTheEndOfAShorterMonth() {
        Instant march31 = kyiv("2026-03-31T20:00:00");
        MetricsPeriod p = MetricsPeriod.parse("month", null, null, KYIV, march31);

        assertThat(p.prevFrom()).isEqualTo(kyiv("2026-02-01T00:00:00"));
        assertThat(p.prevTo()).isEqualTo(kyiv("2026-03-01T00:00:00"));
    }

    @Test
    void prevMonth_isTheWholePreviousCalendarMonth() {
        MetricsPeriod p = MetricsPeriod.parse("prevmonth", null, null, KYIV, now);

        assertThat(p.from()).isEqualTo(kyiv("2026-09-01T00:00:00"));
        assertThat(p.to()).isEqualTo(kyiv("2026-10-01T00:00:00"));
        assertThat(p.prevFrom()).isEqualTo(kyiv("2026-08-01T00:00:00"));
        assertThat(p.prevTo()).isEqualTo(kyiv("2026-09-01T00:00:00"));
    }

    @Test
    void today_isComparedWithYesterdayUpToTheSameTime() {
        MetricsPeriod p = MetricsPeriod.parse("today", null, null, KYIV, now);

        assertThat(p.from()).isEqualTo(kyiv("2026-10-04T00:00:00"));
        assertThat(p.prevFrom()).isEqualTo(kyiv("2026-10-03T00:00:00"));
        assertThat(p.prevTo()).isEqualTo(kyiv("2026-10-03T15:00:00"));
        assertThat(p.granularity()).isEqualTo(MetricsPeriod.Granularity.HOUR);
    }

    @Test
    void sevenDays_includesTodayAndComparesWithTheSevenBefore() {
        MetricsPeriod p = MetricsPeriod.parse("7d", null, null, KYIV, now);

        assertThat(p.from()).isEqualTo(kyiv("2026-09-28T00:00:00"));
        assertThat(p.to()).isEqualTo(kyiv("2026-10-05T00:00:00"));
        assertThat(p.prevFrom()).isEqualTo(kyiv("2026-09-21T00:00:00"));
        // 6 whole days + today until 15:00 -> the 7 days before, also cut at 15:00 of their last day
        assertThat(p.prevTo()).isEqualTo(kyiv("2026-09-27T15:00:00"));
    }

    @Test
    void ninetyDays_comparisonIsCutAtTheSameTimeOfDay() {
        MetricsPeriod p = MetricsPeriod.parse("90d", null, null, KYIV, now);

        assertThat(p.from()).isEqualTo(kyiv("2026-07-07T00:00:00"));
        assertThat(p.prevFrom()).isEqualTo(kyiv("2026-04-08T00:00:00"));
        assertThat(p.prevTo()).isEqualTo(kyiv("2026-07-06T15:00:00"));
        // equal spans: no "−1 day" bias in every comparison
        assertThat(java.time.Duration.between(p.prevFrom(), p.prevTo()))
                .isEqualTo(java.time.Duration.between(p.from(), now));
    }

    @Test
    void custom_runningPastNow_comparesTheSameElapsedSpan() {
        // "1–31 October" asked on Oct 4 at 15:00: 3 days 15 h of data, not a whole month vs 3 days.
        MetricsPeriod p = MetricsPeriod.parse("custom", "2026-10-01", "2026-10-31", KYIV, now);

        assertThat(p.to()).isEqualTo(now);
        assertThat(p.prevFrom()).isEqualTo(kyiv("2026-08-31T00:00:00"));
        assertThat(p.prevTo()).isEqualTo(kyiv("2026-09-03T15:00:00"));
    }

    @Test
    void custom_inclusiveDates_swappedWhenReversed() {
        MetricsPeriod p = MetricsPeriod.parse("custom", "2026-09-10", "2026-09-01", KYIV, now);

        assertThat(p.from()).isEqualTo(kyiv("2026-09-01T00:00:00"));
        assertThat(p.to()).isEqualTo(kyiv("2026-09-11T00:00:00"));
        assertThat(p.prevFrom()).isEqualTo(kyiv("2026-08-22T00:00:00"));
        assertThat(p.prevTo()).isEqualTo(p.from());
    }

    @Test
    void custom_withoutDates_isABadRequest() {
        assertThatThrownBy(() -> MetricsPeriod.parse("custom", null, "2026-09-01", KYIV, now))
                .isInstanceOf(BadRequestException.class);
    }

    @Test
    void unknownToken_fallsBackToMonth() {
        assertThat(MetricsPeriod.parse("whatever", null, null, KYIV, now).token()).isEqualTo("month");
    }

    @Test
    void lateEveningOrder_belongsToItsKyivDay() {
        // 23:30 Kyiv on Sep 30 is 20:30 UTC — still September, not October.
        MetricsPeriod sept = MetricsPeriod.parse("prevmonth", null, null, KYIV, now);
        assertThat(sept.contains(kyiv("2026-09-30T23:30:00"))).isTrue();
        assertThat(sept.contains(kyiv("2026-10-01T00:30:00"))).isFalse();
    }
}
