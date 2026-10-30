package com.maxsolch.shop.analytics.infra;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/**
 * "Online now" from the {@code client_events} journal. Time windows are computed in SQL ({@code NOW() - INTERVAL ...})
 * against a column MySQL fills itself, so the JVM and session time zones never have to agree.
 */
@Repository
public class OnlineQueries {

    /** One key per person: a Telegram id beats the browser id it signed in from. */
    private static final String VISITOR = "CASE WHEN telegram_user_id IS NOT NULL THEN CONCAT('t', telegram_user_id) "
            + "WHEN anon_id IS NOT NULL THEN CONCAT('a', anon_id) ELSE CONCAT('s', session_id) END";

    /** Distinct visitors in the window: by channel and in total. */
    public record Counts(long miniapp, long web, long total) {
    }

    private final JdbcTemplate jdbc;

    public OnlineQueries(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public Counts within(int windowMinutes) {
        long[] byChannel = {0, 0};
        jdbc.query("SELECT channel, COUNT(DISTINCT " + VISITOR + ") n FROM client_events "
                        + "WHERE created_at >= NOW() - INTERVAL " + windowMinutes + " MINUTE GROUP BY channel",
                rs -> {
                    String ch = rs.getString("channel");
                    if ("WEB".equals(ch)) {
                        byChannel[1] = rs.getLong("n");
                    } else {
                        byChannel[0] += rs.getLong("n");
                    }
                });
        Long total = jdbc.queryForObject("SELECT COUNT(DISTINCT " + VISITOR + ") FROM client_events "
                + "WHERE created_at >= NOW() - INTERVAL " + windowMinutes + " MINUTE", Long.class);
        return new Counts(byChannel[0], byChannel[1], total == null ? 0 : total);
    }
}
