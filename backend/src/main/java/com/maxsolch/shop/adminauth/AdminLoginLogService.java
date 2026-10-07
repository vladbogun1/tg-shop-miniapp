package com.maxsolch.shop.adminauth;

import com.maxsolch.shop.common.UserAgents;
import com.maxsolch.shop.geo.GeoIpLookup;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.List;

import static com.maxsolch.shop.common.Texts.cut;

/**
 * Admin sign-in history ({@code admin_login_log}, V37): every attempt — success or not — with the
 * place (offline GeoIP, see {@link GeoIpLookup}), the device ("Windows · Chrome") and whether that
 * device / city was seen before in this admin's successful sign-ins. Kept {@value #RETENTION_DAYS}
 * days. A failure to write is logged and never breaks the sign-in itself.
 */
@Slf4j
@Service
public class AdminLoginLogService {

    public static final int RETENTION_DAYS = 90;

    /** What happened. Only {@code OK} is a finished sign-in. */
    public enum Result {
        OK,
        BAD_PASSWORD,
        UNKNOWN_LOGIN,
        BAD_CODE,
        LOCKED,
        NOT_ADMIN,
        BAD_TELEGRAM
    }

    /** What the second step was. */
    public enum SecondFactor { TOTP, TRUSTED_DEVICE, SETUP }

    /** What was written: the place / device shown to the admin and in the Telegram alert. */
    public record Recorded(String place, String device, boolean newDevice, boolean newCity) {
    }

    public record Entry(long id, Instant at, String method, String result, String secondFactor, String ip,
                        String country, String city, String device, boolean newDevice, boolean newCity) {
    }

    private final JdbcTemplate jdbc;
    private final GeoIpLookup geoIp;

    public AdminLoginLogService(JdbcTemplate jdbc, GeoIpLookup geoIp) {
        this.jdbc = jdbc;
        this.geoIp = geoIp;
    }

    public Recorded record(Long adminId, String login, LoginMethod method, Result result,
                           SecondFactor secondFactor, ClientInfo client) {
        String device = UserAgents.osAndBrowser(client.userAgent());
        GeoIpLookup.Place place = geoIp.lookup(client.ip()).orElse(null);
        String city = place == null ? null : place.city();
        String country = place == null ? null : place.country();
        boolean newDevice = false;
        boolean newCity = false;
        try {
            if (adminId != null) {
                newDevice = !seen(adminId, "device_label", device);
                newCity = city != null && !seen(adminId, "city", city);
            }
            jdbc.update("INSERT INTO admin_login_log (admin_id, login, method, result, second_factor, ip, country, "
                            + "city, user_agent, device_label, new_device, new_city) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
                    adminId, cut(login, 128), method.name(), result.name(),
                    secondFactor == null ? null : secondFactor.name(), cut(client.ip(), 45), cut(country, 100),
                    cut(city, 120), cut(client.userAgent(), 255), cut(device, 120), newDevice, newCity);
        } catch (Exception e) {
            log.warn("Failed to write admin login log: {}", e.getMessage());
        }
        return new Recorded(placeLabel(city, country), device, newDevice, newCity);
    }

    /** Was this value seen in an earlier successful sign-in of the admin? */
    private boolean seen(long adminId, String column, String value) {
        Integer n = jdbc.queryForObject("SELECT COUNT(*) FROM admin_login_log WHERE admin_id = ? AND result = 'OK' AND "
                + column + " = ?", Integer.class, adminId, value);
        return n != null && n > 0;
    }

    public List<Entry> recent(long adminId, int limit) {
        return jdbc.query("SELECT id, created_at, method, result, second_factor, ip, country, city, device_label, "
                        + "new_device, new_city FROM admin_login_log WHERE admin_id = ? ORDER BY created_at DESC, id DESC LIMIT ?",
                (rs, i) -> new Entry(rs.getLong("id"), rs.getTimestamp("created_at").toInstant(),
                        rs.getString("method"), rs.getString("result"), rs.getString("second_factor"),
                        rs.getString("ip"), rs.getString("country"), rs.getString("city"),
                        rs.getString("device_label"), rs.getBoolean("new_device"), rs.getBoolean("new_city")),
                adminId, limit);
    }

    @Scheduled(cron = "${app.security.admin-login-log-purge-cron:0 40 4 * * *}")
    public void purge() {
        try {
            int removed = jdbc.update("DELETE FROM admin_login_log WHERE created_at < ?",
                    Timestamp.from(Instant.now().minus(Duration.ofDays(RETENTION_DAYS))));
            if (removed > 0) {
                log.info("Admin login log: removed {} entries older than {} days", removed, RETENTION_DAYS);
            }
        } catch (Exception e) {
            log.warn("Admin login log purge failed: {}", e.getMessage());
        }
    }

    static String placeLabel(String city, String country) {
        if (city != null && !city.isBlank()) {
            return city;
        }
        if (country != null && !country.isBlank()) {
            return country;
        }
        return "место неизвестно";
    }
}
