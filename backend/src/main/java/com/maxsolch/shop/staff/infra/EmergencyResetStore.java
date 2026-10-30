package com.maxsolch.shop.staff.infra;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/** The {@code admin_emergency_resets} table: one marker per ADMIN_PASSWORD value an emergency reset was done for. */
@Repository
public class EmergencyResetStore {

    private final JdbcTemplate jdbc;

    public EmergencyResetStore(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public boolean done(String marker) {
        Integer n = jdbc.queryForObject("SELECT COUNT(*) FROM admin_emergency_resets WHERE marker = ?",
                Integer.class, marker);
        return n != null && n > 0;
    }

    public void mark(long adminId, String marker) {
        jdbc.update("INSERT INTO admin_emergency_resets (admin_id, marker) VALUES (?, ?)", adminId, marker);
    }
}
