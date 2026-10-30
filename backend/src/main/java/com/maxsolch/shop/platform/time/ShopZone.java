package com.maxsolch.shop.platform.time;

import com.maxsolch.shop.platform.config.AppProperties;

import java.time.Clock;
import java.time.DateTimeException;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZonedDateTime;

/**
 * The shop's business timezone ({@code app.timezone}, default Europe/Kyiv): the zone for "today", day buckets,
 * human-facing dates and cron schedules. A bad or blank setting falls back to Europe/Kyiv instead of failing a request.
 *
 * <p>One bean ({@link TimeConfig}), one meaning of "the shop's day": a class that needs it takes {@code ShopZone}
 * (and {@link Clock}) in its constructor. Nobody else writes {@code ZoneId.of(...)}, {@code Instant.now()} or a zone
 * name (rule C1).
 */
public final class ShopZone {

    private final ZoneId zone;

    /** From the configured id ({@code app.timezone}); blank or invalid values give the default zone. */
    public ShopZone(String configured) {
        this.zone = parse(configured);
    }

    private static ZoneId parse(String configured) {
        if (configured == null || configured.isBlank()) {
            return ZoneId.of(AppProperties.DEFAULT_TIMEZONE);
        }
        try {
            return ZoneId.of(configured.trim());
        } catch (DateTimeException e) {
            return ZoneId.of(AppProperties.DEFAULT_TIMEZONE);
        }
    }

    public ZoneId zone() {
        return zone;
    }

    /** The shop's current date. */
    public LocalDate today(Clock clock) {
        return LocalDate.now(clock.withZone(zone));
    }

    /** The current moment on the shop's wall clock. */
    public ZonedDateTime now(Clock clock) {
        return ZonedDateTime.now(clock.withZone(zone));
    }
}
