package com.maxsolch.shop.customer.infra;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;

/**
 * Reads of the users map: {@code visitor_locations} aggregated by place and the people behind one point. Time windows
 * are computed in SQL ({@code NOW() - INTERVAL ...}) against columns MySQL fills itself, so the JVM and session time
 * zones never have to agree.
 */
@Repository
public class VisitorMapQueries {

    private static final int MAX_POINTS = 5_000;
    private static final int MAX_POINT_USERS = 200;
    private static final int MAX_POINT_ANON = 50;

    /** One place on the map. */
    public record PointRow(BigDecimal lat, BigDecimal lon, String city, String country, String countryCode,
                           long visitors, long users, long miniapp, Instant lastSeen) {
    }

    /** Visitors in the window: all of them, and those the GeoIP base could not place. */
    public record Totals(long visitors, long withoutLocation) {
    }

    /** A signed-in customer at a point: the user's columns and where he was seen from. */
    public record UserAtPoint(long telegramUserId, String username, String firstName, String lastName,
                              String languageCode, boolean premium, boolean botBlocked, Instant createdAt,
                              Instant lastSeenAt, String locale, String ip, String channel, String city,
                              String country, Instant seenAt) {
    }

    public record AnonAtPoint(String ip, Instant seenAt) {
    }

    public record Place(String city, String country) {
    }

    private final JdbcTemplate jdbc;

    public VisitorMapQueries(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public List<PointRow> points(int days) {
        return jdbc.query(
                "SELECT lat, lon, MAX(city) city, MAX(country) country, MAX(country_code) cc, COUNT(*) visitors, "
                        + "SUM(telegram_user_id IS NOT NULL) users, SUM(channel = 'MINIAPP') miniapp, "
                        + "MAX(seen_at) last_seen "
                        + "FROM visitor_locations "
                        + "WHERE lat IS NOT NULL AND lon IS NOT NULL AND seen_at >= NOW() - INTERVAL ? DAY "
                        + "GROUP BY lat, lon ORDER BY visitors DESC LIMIT " + MAX_POINTS,
                (rs, i) -> new PointRow(rs.getBigDecimal("lat"), rs.getBigDecimal("lon"), rs.getString("city"),
                        rs.getString("country"), rs.getString("cc"), rs.getLong("visitors"), rs.getLong("users"),
                        rs.getLong("miniapp"), instant(rs, "last_seen")), days);
    }

    public Totals totals(int days) {
        long[] t = jdbc.query(
                "SELECT COUNT(*), SUM(lat IS NULL OR lon IS NULL) FROM visitor_locations "
                        + "WHERE seen_at >= NOW() - INTERVAL ? DAY",
                rs -> rs.next() ? new long[]{rs.getLong(1), rs.getLong(2)} : new long[]{0, 0}, days);
        return new Totals(t[0], t[1]);
    }

    public List<UserAtPoint> usersAt(BigDecimal lat, BigDecimal lon, int days) {
        RowMapper<UserAtPoint> map = (rs, i) -> new UserAtPoint(rs.getLong("telegram_user_id"), rs.getString("username"),
                rs.getString("first_name"), rs.getString("last_name"), rs.getString("language_code"),
                rs.getBoolean("is_premium"), rs.getBoolean("bot_blocked"), instant(rs, "created_at"),
                instant(rs, "last_seen_at"), rs.getString("locale"), rs.getString("ip"), rs.getString("channel"),
                rs.getString("city"), rs.getString("country"), instant(rs, "seen_at"));
        return jdbc.query(
                "SELECT v.telegram_user_id, u.username, u.first_name, u.last_name, u.language_code, "
                        + "u.is_premium, u.bot_blocked, "
                        + "u.created_at, u.last_seen_at, u.locale, v.ip, v.channel, v.city, v.country, v.seen_at "
                        + "FROM visitor_locations v JOIN users u ON u.telegram_user_id = v.telegram_user_id "
                        + "WHERE v.lat = ? AND v.lon = ? AND v.seen_at >= NOW() - INTERVAL ? DAY "
                        + "ORDER BY v.seen_at DESC LIMIT " + MAX_POINT_USERS, map, lat, lon, days);
    }

    public List<AnonAtPoint> anonymousAt(BigDecimal lat, BigDecimal lon, int days) {
        return jdbc.query(
                "SELECT ip, seen_at FROM visitor_locations "
                        + "WHERE telegram_user_id IS NULL AND lat = ? AND lon = ? AND seen_at >= NOW() - INTERVAL ? DAY "
                        + "ORDER BY seen_at DESC LIMIT " + MAX_POINT_ANON,
                (rs, i) -> new AnonAtPoint(rs.getString("ip"), instant(rs, "seen_at")), lat, lon, days);
    }

    public long anonymousTotalAt(BigDecimal lat, BigDecimal lon, int days) {
        Long n = jdbc.queryForObject(
                "SELECT COUNT(*) FROM visitor_locations "
                        + "WHERE telegram_user_id IS NULL AND lat = ? AND lon = ? AND seen_at >= NOW() - INTERVAL ? DAY",
                Long.class, lat, lon, days);
        return n == null ? 0 : n;
    }

    public Place placeOf(BigDecimal lat, BigDecimal lon) {
        return jdbc.query("SELECT MAX(city), MAX(country) FROM visitor_locations WHERE lat = ? AND lon = ?",
                rs -> rs.next() ? new Place(rs.getString(1), rs.getString(2)) : new Place(null, null), lat, lon);
    }

    private static Instant instant(ResultSet rs, String col) throws SQLException {
        Timestamp t = rs.getTimestamp(col);
        return t == null ? null : t.toInstant();
    }
}
