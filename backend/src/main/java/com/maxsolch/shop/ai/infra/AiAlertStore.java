package com.maxsolch.shop.ai.infra;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/** {@code ai_alerts} (V89): one row per warning and period; the unique key is the lock that makes a push go out once. */
@Repository
public class AiAlertStore {

    private final JdbcTemplate jdbc;

    public AiAlertStore(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** True when this call is the first to mark the warning for the period: the caller sends the push. */
    public boolean claim(String period, String threshold) {
        return jdbc.update("insert ignore into ai_alerts (period, threshold, created_at) values (?, ?, current_timestamp(6))",
                period, threshold) == 1;
    }

    /** Forget a warning (the key works again): the next failure warns anew. */
    public void clear(String threshold) {
        jdbc.update("delete from ai_alerts where threshold = ?", threshold);
    }
}
