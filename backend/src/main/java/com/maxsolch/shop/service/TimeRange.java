package com.maxsolch.shop.service;

import java.time.Duration;
import java.time.Instant;

/**
 * Time-range filter shared by the admin order list, board, and metrics endpoints. Translates a
 * request token into a createdAt lower bound (relative to {@link Instant#now()}). {@code ALL} has
 * no bound (returns {@code null}). {@code MONTH} is the default.
 *
 * <p>Uses day-based {@link Duration} (Instant does not support month/year units).
 */
public enum TimeRange {
    MONTH(Duration.ofDays(30)),
    HALFYEAR(Duration.ofDays(182)),
    YEAR(Duration.ofDays(365)),
    ALL(null);

    private final Duration period;

    TimeRange(Duration period) {
        this.period = period;
    }

    /** Lenient parse; null/blank/unknown -> MONTH (the default). */
    public static TimeRange parse(String raw) {
        if (raw == null || raw.isBlank()) {
            return MONTH;
        }
        try {
            return valueOf(raw.trim().toUpperCase());
        } catch (IllegalArgumentException e) {
            return MONTH;
        }
    }

    /** Lower bound for createdAt, or {@code null} for ALL (no bound). */
    public Instant from(Instant now) {
        return period == null ? null : now.minus(period);
    }

    public Instant from() {
        return from(Instant.now());
    }

    public String token() {
        return name().toLowerCase();
    }
}
