package com.maxsolch.shop.analytics.metrics;

import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.time.temporal.TemporalAdjusters;
import java.util.ArrayList;
import java.util.List;

/**
 * Time buckets for the series charts, in the shop's timezone. Keys: {@code yyyy-MM-ddTHH} for hours,
 * {@code yyyy-MM-dd} for days, the Monday's {@code yyyy-MM-dd} for weeks.
 */
final class Buckets {

    private static final DateTimeFormatter HOUR = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH");
    private static final DateTimeFormatter DAY = DateTimeFormatter.ISO_LOCAL_DATE;

    private Buckets() {
    }

    static String key(Instant t, MetricsPeriod.Granularity g, ZoneId zone) {
        ZonedDateTime z = t.atZone(zone);
        return switch (g) {
            case HOUR -> z.truncatedTo(ChronoUnit.HOURS).format(HOUR);
            case DAY -> z.toLocalDate().format(DAY);
            case WEEK -> z.toLocalDate().with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY)).format(DAY);
        };
    }

    /** All bucket keys from {@code from} (inclusive) to {@code to} (exclusive), zero-fill order. */
    static List<String> keys(Instant from, Instant to, MetricsPeriod.Granularity g, ZoneId zone) {
        List<String> out = new ArrayList<>();
        if (!from.isBefore(to)) {
            out.add(key(from, g, zone));
            return out;
        }
        ZonedDateTime cur = from.atZone(zone);
        cur = switch (g) {
            case HOUR -> cur.truncatedTo(ChronoUnit.HOURS);
            case DAY -> cur.toLocalDate().atStartOfDay(zone);
            case WEEK -> cur.toLocalDate().with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY)).atStartOfDay(zone);
        };
        int guard = 0;
        while (cur.toInstant().isBefore(to) && guard++ < 5000) {
            out.add(key(cur.toInstant(), g, zone));
            cur = switch (g) {
                case HOUR -> cur.plusHours(1);
                case DAY -> cur.toLocalDate().plusDays(1).atStartOfDay(zone);
                case WEEK -> cur.toLocalDate().plusWeeks(1).atStartOfDay(zone);
            };
        }
        return out;
    }

    static LocalDate day(Instant t, ZoneId zone) {
        return LocalDate.ofInstant(t, zone);
    }
}
