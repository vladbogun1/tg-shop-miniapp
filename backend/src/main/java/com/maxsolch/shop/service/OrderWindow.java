package com.maxsolch.shop.service;

import com.maxsolch.shop.platform.error.BadRequestException;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeParseException;
import java.time.temporal.ChronoUnit;

/**
 * The createdAt window of the order board and table: {@code [from, to)}, either bound may be null.
 *
 * <p>The board only had rolling windows ({@link TimeRange}: "Месяц" = the last 30 days), while the
 * owner also wants calendar periods, as on the metrics page. Tokens:
 * <ul>
 *   <li>{@code week}, {@code month}, {@code halfyear}, {@code year}, {@code all} — the old rolling
 *       windows ({@link TimeRange}), unchanged for old clients and the other screens</li>
 *   <li>{@code thismonth}, {@code thisyear} — since the 1st of this month / year (shop timezone)</li>
 *   <li>{@code prevmonth}, {@code prevyear} — the whole previous calendar month / year</li>
 *   <li>{@code custom} — {@code fromDate}..{@code toDate} inclusive, yyyy-MM-dd</li>
 * </ul>
 * Anything else falls back to {@code month}, like {@link TimeRange#parse}.
 */
public record OrderWindow(Instant from, Instant to) {

    private static final int MAX_CUSTOM_DAYS = 3 * 366;

    public static OrderWindow parse(String token, String fromDate, String toDate, ZoneId zone, Instant now) {
        String t = token == null ? "" : token.trim().toLowerCase();
        LocalDate today = now.atZone(zone).toLocalDate();
        return switch (t) {
            case "thismonth" -> new OrderWindow(start(today.withDayOfMonth(1), zone), null);
            case "prevmonth" -> {
                LocalDate first = today.withDayOfMonth(1).minusMonths(1);
                yield new OrderWindow(start(first, zone), start(first.plusMonths(1), zone));
            }
            case "thisyear" -> new OrderWindow(start(today.withDayOfYear(1), zone), null);
            case "prevyear" -> {
                LocalDate first = today.withDayOfYear(1).minusYears(1);
                yield new OrderWindow(start(first, zone), start(first.plusYears(1), zone));
            }
            case "custom" -> custom(fromDate, toDate, zone);
            default -> new OrderWindow(TimeRange.parse(t).from(now), null);
        };
    }

    private static OrderWindow custom(String fromDate, String toDate, ZoneId zone) {
        LocalDate from;
        LocalDate to;
        try {
            from = LocalDate.parse(fromDate);
            to = LocalDate.parse(toDate);
        } catch (DateTimeParseException | NullPointerException e) {
            throw new BadRequestException("custom range needs from/to as yyyy-MM-dd");
        }
        if (to.isBefore(from)) {
            LocalDate tmp = from;
            from = to;
            to = tmp;
        }
        if (ChronoUnit.DAYS.between(from, to) + 1 > MAX_CUSTOM_DAYS) {
            throw new BadRequestException("custom range is limited to " + MAX_CUSTOM_DAYS + " days");
        }
        return new OrderWindow(start(from, zone), start(to.plusDays(1), zone));
    }

    private static Instant start(LocalDate day, ZoneId zone) {
        return day.atStartOfDay(zone).toInstant();
    }

    /** No bound at all — the board then counts its closed columns with the all-time query. */
    public boolean unbounded() {
        return from == null && to == null;
    }
}
