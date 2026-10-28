package com.maxsolch.shop.service;

import com.maxsolch.shop.web.BadRequestException;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** The board's periods: the old rolling windows stay, calendar ones are cut in Kyiv time. */
class OrderWindowTest {

    private static final ZoneId KYIV = ZoneId.of("Europe/Kyiv");
    /** 2026-10-04 15:00 in Kyiv (UTC+3). */
    private final Instant now = kyiv("2026-10-04T15:00:00");

    private static Instant kyiv(String local) {
        return LocalDateTime.parse(local).atZone(KYIV).toInstant();
    }

    @Test
    void rollingTokens_keepTheirOldMeaning() {
        assertThat(OrderWindow.parse("week", null, null, KYIV, now))
                .isEqualTo(new OrderWindow(now.minus(Duration.ofDays(7)), null));
        assertThat(OrderWindow.parse("month", null, null, KYIV, now))
                .isEqualTo(new OrderWindow(now.minus(Duration.ofDays(30)), null));
        assertThat(OrderWindow.parse("all", null, null, KYIV, now).unbounded()).isTrue();
        // unknown / missing -> the old default (last 30 days)
        assertThat(OrderWindow.parse(null, null, null, KYIV, now).from()).isEqualTo(now.minus(Duration.ofDays(30)));
    }

    @Test
    void thisMonthAndYear_startOnTheFirst_noUpperBound() {
        assertThat(OrderWindow.parse("thismonth", null, null, KYIV, now))
                .isEqualTo(new OrderWindow(kyiv("2026-10-01T00:00:00"), null));
        assertThat(OrderWindow.parse("thisyear", null, null, KYIV, now))
                .isEqualTo(new OrderWindow(kyiv("2026-01-01T00:00:00"), null));
    }

    @Test
    void previousMonthAndYear_areWholeCalendarPeriods() {
        assertThat(OrderWindow.parse("prevmonth", null, null, KYIV, now))
                .isEqualTo(new OrderWindow(kyiv("2026-09-01T00:00:00"), kyiv("2026-10-01T00:00:00")));
        assertThat(OrderWindow.parse("prevyear", null, null, KYIV, now))
                .isEqualTo(new OrderWindow(kyiv("2025-01-01T00:00:00"), kyiv("2026-01-01T00:00:00")));
    }

    @Test
    void custom_isInclusiveOfBothDays_andSwapsReversedDates() {
        OrderWindow w = OrderWindow.parse("custom", "2026-09-20", "2026-09-10", KYIV, now);
        assertThat(w).isEqualTo(new OrderWindow(kyiv("2026-09-10T00:00:00"), kyiv("2026-09-21T00:00:00")));
    }

    @Test
    void custom_withoutDates_isRejected() {
        assertThatThrownBy(() -> OrderWindow.parse("custom", null, "2026-09-10", KYIV, now))
                .isInstanceOf(BadRequestException.class);
    }
}
