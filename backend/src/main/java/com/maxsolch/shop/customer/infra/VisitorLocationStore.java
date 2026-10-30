package com.maxsolch.shop.customer.infra;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;

/** The {@code visitor_locations} table: one row per visitor (by Telegram id or browser id) with the last place seen. */
@Repository
public class VisitorLocationStore {

    private static final String UPSERT = "INSERT INTO visitor_locations "
            + "(visitor_key, telegram_user_id, anon_id, channel, ip, country_code, country, city, lat, lon, seen_at) "
            + "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP) "
            + "ON DUPLICATE KEY UPDATE telegram_user_id = VALUES(telegram_user_id), anon_id = VALUES(anon_id), "
            + "channel = VALUES(channel), ip = VALUES(ip), country_code = VALUES(country_code), "
            + "country = VALUES(country), city = VALUES(city), lat = VALUES(lat), lon = VALUES(lon), "
            + "seen_at = CURRENT_TIMESTAMP";

    private final JdbcTemplate jdbc;

    public VisitorLocationStore(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public void upsert(String key, Long telegramUserId, String anonId, String channel, String ip,
                       String countryCode, String country, String city, BigDecimal lat, BigDecimal lon) {
        jdbc.update(UPSERT, key, telegramUserId, anonId, channel, ip, countryCode, country, city, lat, lon);
    }

    public void delete(String key) {
        jdbc.update("DELETE FROM visitor_locations WHERE visitor_key = ?", key);
    }

    /** @return how many rows were older than {@code days} and are gone */
    public int purgeOlderThan(int days) {
        return jdbc.update("DELETE FROM visitor_locations WHERE seen_at < NOW() - INTERVAL " + days + " DAY");
    }
}
