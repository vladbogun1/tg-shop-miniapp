package com.maxsolch.shop.staff.infra;

import com.maxsolch.shop.staff.domain.LoginLogEntry;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;

/** The {@code admin_login_log} table (V37). */
@Repository
public class AdminLoginLogStore {

    private final JdbcTemplate jdbc;

    public AdminLoginLogStore(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** Was this value (a device label or a city) seen in an earlier successful sign-in of the admin? */
    public boolean seen(long adminId, String column, String value) {
        Integer n = jdbc.queryForObject("SELECT COUNT(*) FROM admin_login_log WHERE admin_id = ? AND result = 'OK' AND "
                + column + " = ?", Integer.class, adminId, value);
        return n != null && n > 0;
    }

    public void insert(Long adminId, String login, String method, String result, String secondFactor, String ip,
                       String country, String city, String userAgent, String deviceLabel, boolean newDevice,
                       boolean newCity) {
        jdbc.update("INSERT INTO admin_login_log (admin_id, login, method, result, second_factor, ip, country, "
                        + "city, user_agent, device_label, new_device, new_city) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
                adminId, login, method, result, secondFactor, ip, country, city, userAgent, deviceLabel, newDevice,
                newCity);
    }

    public List<LoginLogEntry> recent(long adminId, int limit) {
        return jdbc.query("SELECT id, created_at, method, result, second_factor, ip, country, city, device_label, "
                        + "new_device, new_city FROM admin_login_log WHERE admin_id = ? ORDER BY created_at DESC, id DESC LIMIT ?",
                (rs, i) -> new LoginLogEntry(rs.getLong("id"), rs.getTimestamp("created_at").toInstant(),
                        rs.getString("method"), rs.getString("result"), rs.getString("second_factor"),
                        rs.getString("ip"), rs.getString("country"), rs.getString("city"),
                        rs.getString("device_label"), rs.getBoolean("new_device"), rs.getBoolean("new_city")),
                adminId, limit);
    }

    /** @return how many entries older than {@code before} are gone */
    public int deleteOlderThan(Instant before) {
        return jdbc.update("DELETE FROM admin_login_log WHERE created_at < ?", Timestamp.from(before));
    }
}
