package com.maxsolch.shop.analytics.metrics;

import com.maxsolch.shop.web.BadRequestException;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.format.DateTimeParseException;
import java.time.temporal.ChronoUnit;

/**
 * A reporting period of the metrics page, cut in the shop's timezone, plus the period it is
 * compared with.
 *
 * <p>The old dashboard only had rolling windows ("month" = the last 30 days from now) and no
 * comparison at all, while the owner thinks in calendar months. Here:
 * <ul>
 *   <li>{@code today} — since local midnight; compared with yesterday up to the same time</li>
 *   <li>{@code 7d}, {@code 90d} — the last N whole days including today; compared with the N before</li>
 *   <li>{@code month} — this calendar month to now; compared with the same number of days of the
 *       previous month (month-to-date vs month-to-date, so a half-month is not set against a full one)</li>
 *   <li>{@code prevmonth} — the whole previous month; compared with the month before it</li>
 *   <li>{@code year} — this calendar year to now; compared with the same span of last year</li>
 *   <li>{@code custom} — {@code from}..{@code to} inclusive dates; compared with the same length before</li>
 * </ul>
 *
 * @param from     inclusive start
 * @param to       exclusive end (never after "now" for the running periods)
 * @param prevFrom start of the comparison period
 * @param prevTo   exclusive end of the comparison period
 */
public record MetricsPeriod(String token,
                            Instant from,
                            Instant to,
                            Instant prevFrom,
                            Instant prevTo,
                            Granularity granularity) {

    /** Bucket size of the time series: hours for a day, days up to a quarter, weeks beyond. */
    public enum Granularity { HOUR, DAY, WEEK }

    private static final int MAX_CUSTOM_DAYS = 3 * 366;

    public static MetricsPeriod parse(String token, String fromDate, String toDate, ZoneId zone, Instant now) {
        String t = token == null || token.isBlank() ? "month" : token.trim().toLowerCase();
        ZonedDateTime nowZ = now.atZone(zone);
        LocalDate today = nowZ.toLocalDate();
        Instant todayStart = today.atStartOfDay(zone).toInstant();
        Instant tomorrowStart = today.plusDays(1).atStartOfDay(zone).toInstant();
        return switch (t) {
            case "today" -> {
                Instant yStart = today.minusDays(1).atStartOfDay(zone).toInstant();
                yield new MetricsPeriod(t, todayStart, now, yStart,
                        yStart.plus(Duration.between(todayStart, now)), Granularity.HOUR);
            }
            case "7d" -> lastDays(t, 7, today, zone, tomorrowStart);
            case "90d" -> lastDays(t, 90, today, zone, tomorrowStart);
            case "prevmonth" -> {
                LocalDate first = today.withDayOfMonth(1).minusMonths(1);
                yield new MetricsPeriod(t,
                        first.atStartOfDay(zone).toInstant(),
                        first.plusMonths(1).atStartOfDay(zone).toInstant(),
                        first.minusMonths(1).atStartOfDay(zone).toInstant(),
                        first.atStartOfDay(zone).toInstant(),
                        Granularity.DAY);
            }
            case "year" -> {
                LocalDate first = today.withDayOfYear(1);
                Instant start = first.atStartOfDay(zone).toInstant();
                ZonedDateTime prevStart = first.minusYears(1).atStartOfDay(zone);
                Instant prevEnd = nowZ.minusYears(1).toInstant();
                yield new MetricsPeriod(t, start, now, prevStart.toInstant(), prevEnd, Granularity.WEEK);
            }
            case "custom" -> custom(fromDate, toDate, zone, now);
            default -> { // "month"
                LocalDate first = today.withDayOfMonth(1);
                Instant start = first.atStartOfDay(zone).toInstant();
                ZonedDateTime prevStart = first.minusMonths(1).atStartOfDay(zone);
                // Same elapsed time into the previous month, capped at its end.
                Instant prevEndCap = first.atStartOfDay(zone).toInstant();
                Instant prevEnd = prevStart.toInstant().plus(Duration.between(start, now));
                if (prevEnd.isAfter(prevEndCap)) {
                    prevEnd = prevEndCap;
                }
                yield new MetricsPeriod("month", start, now, prevStart.toInstant(), prevEnd, Granularity.DAY);
            }
        };
    }

    private static MetricsPeriod lastDays(String token, int days, LocalDate today, ZoneId zone, Instant end) {
        Instant start = today.minusDays(days - 1L).atStartOfDay(zone).toInstant();
        Instant prevStart = today.minusDays(2L * days - 1).atStartOfDay(zone).toInstant();
        return new MetricsPeriod(token, start, end, prevStart, start,
                days > 92 ? Granularity.WEEK : Granularity.DAY);
    }

    private static MetricsPeriod custom(String fromDate, String toDate, ZoneId zone, Instant now) {
        LocalDate from;
        LocalDate to;
        try {
            from = LocalDate.parse(fromDate);
            to = LocalDate.parse(toDate);
        } catch (DateTimeParseException | NullPointerException e) {
            throw new BadRequestException("custom period needs from/to as yyyy-MM-dd");
        }
        if (to.isBefore(from)) {
            LocalDate tmp = from;
            from = to;
            to = tmp;
        }
        long days = ChronoUnit.DAYS.between(from, to) + 1;
        if (days > MAX_CUSTOM_DAYS) {
            throw new BadRequestException("custom period is limited to " + MAX_CUSTOM_DAYS + " days");
        }
        Instant start = from.atStartOfDay(zone).toInstant();
        Instant end = to.plusDays(1).atStartOfDay(zone).toInstant();
        Instant prevStart = from.minusDays(days).atStartOfDay(zone).toInstant();
        Granularity g = days <= 1 ? Granularity.HOUR : days > 92 ? Granularity.WEEK : Granularity.DAY;
        return new MetricsPeriod("custom", start, end.isAfter(now) && start.isBefore(now) ? now : end,
                prevStart, start, g);
    }

    public boolean contains(Instant t) {
        return t != null && !t.isBefore(from) && t.isBefore(to);
    }

    public boolean prevContains(Instant t) {
        return t != null && !t.isBefore(prevFrom) && t.isBefore(prevTo);
    }

    /** Whole days covered (at least 1) — divisor for per-day rates. */
    public double days() {
        return Math.max(1.0, Duration.between(from, to).toMinutes() / 1440.0);
    }
}
