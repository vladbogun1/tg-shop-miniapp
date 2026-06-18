package com.maxsolch.shop.service;

import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;

class TimeRangeTest {

    @Test
    void parse_null_defaultsToMonth() {
        assertThat(TimeRange.parse(null)).isEqualTo(TimeRange.MONTH);
    }

    @Test
    void parse_blank_defaultsToMonth() {
        assertThat(TimeRange.parse("   ")).isEqualTo(TimeRange.MONTH);
    }

    @Test
    void parse_unknown_defaultsToMonth() {
        assertThat(TimeRange.parse("whatever")).isEqualTo(TimeRange.MONTH);
    }

    @Test
    void parse_isLenient_caseAndWhitespace() {
        assertThat(TimeRange.parse("  year ")).isEqualTo(TimeRange.YEAR);
        assertThat(TimeRange.parse("HalfYear")).isEqualTo(TimeRange.HALFYEAR);
        assertThat(TimeRange.parse("all")).isEqualTo(TimeRange.ALL);
    }

    @Test
    void from_month_isThirtyDaysBack() {
        Instant now = Instant.parse("2026-06-18T00:00:00Z");
        assertThat(TimeRange.MONTH.from(now)).isEqualTo(now.minus(Duration.ofDays(30)));
    }

    @Test
    void from_halfYear_is182DaysBack() {
        Instant now = Instant.parse("2026-06-18T00:00:00Z");
        assertThat(TimeRange.HALFYEAR.from(now)).isEqualTo(now.minus(Duration.ofDays(182)));
    }

    @Test
    void from_year_is365DaysBack() {
        Instant now = Instant.parse("2026-06-18T00:00:00Z");
        assertThat(TimeRange.YEAR.from(now)).isEqualTo(now.minus(Duration.ofDays(365)));
    }

    @Test
    void from_all_isNull() {
        Instant now = Instant.parse("2026-06-18T00:00:00Z");
        assertThat(TimeRange.ALL.from(now)).isNull();
    }

    @Test
    void token_isLowercaseName() {
        assertThat(TimeRange.MONTH.token()).isEqualTo("month");
        assertThat(TimeRange.HALFYEAR.token()).isEqualTo("halfyear");
        assertThat(TimeRange.ALL.token()).isEqualTo("all");
    }
}
