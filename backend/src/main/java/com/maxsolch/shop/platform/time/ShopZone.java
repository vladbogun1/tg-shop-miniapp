package com.maxsolch.shop.platform.time;

import java.time.Clock;
import java.time.DateTimeException;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZonedDateTime;

/**
 * The shop's business timezone ({@code app.timezone}, default Europe/Kyiv): the zone for "today", day buckets,
 * human-facing dates and cron schedules. A bad or blank setting falls back to Europe/Kyiv instead of failing a request.
 *
 * <p>One bean, one meaning of "the shop's day". Outside {@code platform} do not write {@code ZoneId.of(...)} or
 * {@code Instant.now()}: inject {@link Clock} and this class.
 */
public final class ShopZone {

    public static final ZoneId DEFAULT = ZoneId.of("Europe/Kyiv");

    private final ZoneId zone;

    private ShopZone(ZoneId zone) {
        this.zone = zone;
    }

    /** From the configured id; blank or invalid values give the default zone. */
    public static ShopZone of(String configured) {
        if (configured == null || configured.isBlank()) {
            return new ShopZone(DEFAULT);
        }
        try {
            return new ShopZone(ZoneId.of(configured.trim()));
        } catch (DateTimeException e) {
            return new ShopZone(DEFAULT);
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
