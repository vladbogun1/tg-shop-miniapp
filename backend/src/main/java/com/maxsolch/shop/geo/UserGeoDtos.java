package com.maxsolch.shop.geo;

import com.maxsolch.shop.web.dto.UserCardDto;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

/** Payloads of {@code GET /api/admin/users/geo*} (the users map in the admin). */
public final class UserGeoDtos {

    private UserGeoDtos() {
    }

    /**
     * Distinct visitors with client events in the last {@code windowMinutes}: Telegram users by id,
     * anonymous site visitors by their browser id. A person active in both channels counts once
     * in {@code total}.
     */
    public record Online(long miniapp, long web, long total, int windowMinutes, Instant at) {
    }

    /** All visitors seen from one place (same coordinates = same city in the GeoIP base). */
    public record Point(BigDecimal lat, BigDecimal lon, String city, String country, String countryCode,
                        long visitors, long users, long anonymous, long miniapp, long web, Instant lastSeen) {
    }

    /**
     * @param geoAvailable    false = no GeoIP base on the server, so no visitor has coordinates
     * @param withoutLocation visitors in the window the base could not place (or no base at all)
     */
    public record Overview(boolean geoAvailable, int days, long visitors, long withoutLocation,
                           List<Point> points, Online online) {
    }

    /** A signed-in customer at a point: their admin card plus where they were last seen from. */
    public record PointUser(UserCardDto user, String ip, String channel, String city, String country,
                            Instant seenAt) {
    }

    /** An anonymous site visitor at a point (no account — only the address and the time). */
    public record PointAnon(String ip, Instant seenAt) {
    }

    public record PointDetails(BigDecimal lat, BigDecimal lon, String city, String country,
                               List<PointUser> users, List<PointAnon> anonymous, long anonymousTotal) {
    }
}
