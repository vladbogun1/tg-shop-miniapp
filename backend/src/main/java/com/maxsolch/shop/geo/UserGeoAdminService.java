package com.maxsolch.shop.geo;

import com.maxsolch.shop.web.dto.UserCardDto;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;

/**
 * Reads for the admin users map: points aggregated by place from {@code visitor_locations}, the
 * people behind one point, and "online now" from the {@code client_events} journal.
 *
 * <p>Time windows are computed in SQL ({@code NOW() - INTERVAL ...}) against columns MySQL fills
 * itself, so the JVM and session time zones never have to agree.
 */
@Service
public class UserGeoAdminService {

    /** "Online now" = an event in the last few minutes (the apps flush their journal every ~15 s). */
    static final int ONLINE_WINDOW_MINUTES = 5;

    private static final int MAX_POINTS = 5_000;
    private static final int MAX_POINT_USERS = 200;
    private static final int MAX_POINT_ANON = 50;

    /** One key per person: a Telegram id beats the browser id it signed in from. */
    private static final String VISITOR = "CASE WHEN telegram_user_id IS NOT NULL THEN CONCAT('t', telegram_user_id) "
            + "WHEN anon_id IS NOT NULL THEN CONCAT('a', anon_id) ELSE CONCAT('s', session_id) END";

    private final JdbcTemplate jdbc;
    private final GeoIpLookup geo;

    public UserGeoAdminService(JdbcTemplate jdbc, GeoIpLookup geo) {
        this.jdbc = jdbc;
        this.geo = geo;
    }

    public static int clampDays(int days) {
        return Math.max(1, Math.min(days, VisitorLocationService.RETENTION_DAYS));
    }

    public UserGeoDtos.Overview overview(int days) {
        int d = clampDays(days);
        List<UserGeoDtos.Point> points = jdbc.query(
                "SELECT lat, lon, MAX(city) city, MAX(country) country, MAX(country_code) cc, COUNT(*) visitors, "
                        + "SUM(telegram_user_id IS NOT NULL) users, SUM(channel = 'MINIAPP') miniapp, "
                        + "MAX(seen_at) last_seen "
                        + "FROM visitor_locations "
                        + "WHERE lat IS NOT NULL AND lon IS NOT NULL AND seen_at >= NOW() - INTERVAL ? DAY "
                        + "GROUP BY lat, lon ORDER BY visitors DESC LIMIT " + MAX_POINTS,
                (rs, i) -> {
                    long visitors = rs.getLong("visitors");
                    long users = rs.getLong("users");
                    long miniapp = rs.getLong("miniapp");
                    return new UserGeoDtos.Point(rs.getBigDecimal("lat"), rs.getBigDecimal("lon"),
                            rs.getString("city"), rs.getString("country"), rs.getString("cc"),
                            visitors, users, visitors - users, miniapp, visitors - miniapp,
                            instant(rs, "last_seen"));
                }, d);
        long[] totals = jdbc.query(
                "SELECT COUNT(*), SUM(lat IS NULL OR lon IS NULL) FROM visitor_locations "
                        + "WHERE seen_at >= NOW() - INTERVAL ? DAY",
                rs -> rs.next() ? new long[]{rs.getLong(1), rs.getLong(2)} : new long[]{0, 0}, d);
        return new UserGeoDtos.Overview(geo.available(), d, totals[0], totals[1], points, online());
    }

    public UserGeoDtos.Online online() {
        long[] byChannel = {0, 0};
        jdbc.query("SELECT channel, COUNT(DISTINCT " + VISITOR + ") n FROM client_events "
                        + "WHERE created_at >= NOW() - INTERVAL " + ONLINE_WINDOW_MINUTES + " MINUTE GROUP BY channel",
                rs -> {
                    String ch = rs.getString("channel");
                    if ("WEB".equals(ch)) {
                        byChannel[1] = rs.getLong("n");
                    } else {
                        byChannel[0] += rs.getLong("n");
                    }
                });
        Long total = jdbc.queryForObject("SELECT COUNT(DISTINCT " + VISITOR + ") FROM client_events "
                + "WHERE created_at >= NOW() - INTERVAL " + ONLINE_WINDOW_MINUTES + " MINUTE", Long.class);
        return new UserGeoDtos.Online(byChannel[0], byChannel[1], total == null ? 0 : total,
                ONLINE_WINDOW_MINUTES, Instant.now());
    }

    public UserGeoDtos.PointDetails point(BigDecimal lat, BigDecimal lon, int days) {
        int d = clampDays(days);
        List<UserGeoDtos.PointUser> users = jdbc.query(
                "SELECT v.telegram_user_id, u.username, u.first_name, u.last_name, u.language_code, "
                        + "u.is_premium, u.bot_blocked, "
                        + "(SELECT COUNT(*) FROM orders o WHERE o.tg_user_id = u.telegram_user_id) orders_count, "
                        + "(SELECT COALESCE(SUM(o.total_minor), 0) FROM orders o "
                        + "   WHERE o.tg_user_id = u.telegram_user_id AND o.status <> 'REJECTED') spent, "
                        + "u.created_at, u.last_seen_at, u.locale, v.ip, v.channel, v.city, v.country, v.seen_at "
                        + "FROM visitor_locations v JOIN users u ON u.telegram_user_id = v.telegram_user_id "
                        + "WHERE v.lat = ? AND v.lon = ? AND v.seen_at >= NOW() - INTERVAL ? DAY "
                        + "ORDER BY v.seen_at DESC LIMIT " + MAX_POINT_USERS,
                (rs, i) -> new UserGeoDtos.PointUser(
                        new UserCardDto(rs.getLong("telegram_user_id"), rs.getString("username"),
                                rs.getString("first_name"), rs.getString("last_name"),
                                rs.getString("language_code"), rs.getBoolean("is_premium"),
                                rs.getBoolean("bot_blocked"), rs.getLong("orders_count"), rs.getLong("spent"),
                                instant(rs, "created_at"), instant(rs, "last_seen_at"), rs.getString("locale")),
                        rs.getString("ip"), rs.getString("channel"), rs.getString("city"),
                        rs.getString("country"), instant(rs, "seen_at")),
                lat, lon, d);
        List<UserGeoDtos.PointAnon> anon = jdbc.query(
                "SELECT ip, seen_at FROM visitor_locations "
                        + "WHERE telegram_user_id IS NULL AND lat = ? AND lon = ? AND seen_at >= NOW() - INTERVAL ? DAY "
                        + "ORDER BY seen_at DESC LIMIT " + MAX_POINT_ANON,
                (rs, i) -> new UserGeoDtos.PointAnon(rs.getString("ip"), instant(rs, "seen_at")),
                lat, lon, d);
        Long anonTotal = jdbc.queryForObject(
                "SELECT COUNT(*) FROM visitor_locations "
                        + "WHERE telegram_user_id IS NULL AND lat = ? AND lon = ? AND seen_at >= NOW() - INTERVAL ? DAY",
                Long.class, lat, lon, d);
        String[] place = jdbc.query(
                "SELECT MAX(city), MAX(country) FROM visitor_locations WHERE lat = ? AND lon = ?",
                rs -> rs.next() ? new String[]{rs.getString(1), rs.getString(2)} : new String[]{null, null},
                lat, lon);
        return new UserGeoDtos.PointDetails(lat, lon, place[0], place[1], users, anon,
                anonTotal == null ? 0 : anonTotal);
    }

    private static Instant instant(ResultSet rs, String col) throws SQLException {
        Timestamp t = rs.getTimestamp(col);
        return t == null ? null : t.toInstant();
    }
}
