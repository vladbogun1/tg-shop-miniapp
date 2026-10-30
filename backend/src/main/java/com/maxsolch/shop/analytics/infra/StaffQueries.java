package com.maxsolch.shop.analytics.infra;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.HashSet;
import java.util.Set;

/** SQL behind "who is the shop's staff" for the behaviour journal; the rule that uses it lives in {@code app}. */
@Repository
public class StaffQueries {

    private static final String ADMINS = "(select telegram_user_id from admin_users)";

    private final JdbcTemplate jdbc;

    public StaffQueries(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** Every Telegram id in {@code admin_users}, active or not. */
    public Set<Long> adminTelegramIds() {
        return new HashSet<>(jdbc.queryForList("select telegram_user_id from admin_users", Long.class));
    }

    /**
     * Website browsers that have ever been signed in under an admin id: found in the journal, on the users map
     * ({@code visitor_locations}) and in the rolled-up visitor days (so a browser stays known after its events
     * are purged).
     */
    public Set<String> adminBrowsers() {
        Set<String> anon = new HashSet<>();
        anon.addAll(jdbc.queryForList("select distinct anon_id from client_events "
                + "where anon_id is not null and telegram_user_id in " + ADMINS, String.class));
        anon.addAll(jdbc.queryForList("select distinct anon_id from visitor_locations "
                + "where anon_id is not null and telegram_user_id in " + ADMINS, String.class));
        anon.addAll(jdbc.queryForList("select distinct substring(visitor_key, 3) from analytics_daily_visitors "
                + "where channel = 'WEB' and visitor_key like 'a:%' and telegram_user_id in " + ADMINS, String.class));
        return anon;
    }
}
