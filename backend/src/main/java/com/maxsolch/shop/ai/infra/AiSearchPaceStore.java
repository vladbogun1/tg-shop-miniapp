package com.maxsolch.shop.ai.infra;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.Optional;

/**
 * What the search pacer remembers, in the database so that two backend instances (the old and the new one during a
 * rollout) see the same: the search requests of the last minutes (the lines of {@code ai_usage}) and the «rest» of a
 * provider that failed ({@code ai_search_rest}, V90). Plain statements, each commits at once.
 */
@Repository
public class AiSearchPaceStore {

    private final JdbcTemplate jdbc;

    public AiSearchPaceStore(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** Search requests (any provider, any answer) made since {@code since}. */
    public int requestsSince(Instant since) {
        Integer n = jdbc.queryForObject("select count(*) from ai_usage where kind = 'SEARCH' and created_at >= ?",
                Integer.class, Timestamp.from(since));
        return n == null ? 0 : n;
    }

    /** When the oldest request of the window was made: the window frees one place at that moment plus its length. */
    public Optional<Instant> oldestSince(Instant since) {
        Timestamp t = jdbc.queryForObject("select min(created_at) from ai_usage where kind = 'SEARCH' and created_at >= ?",
                Timestamp.class, Timestamp.from(since));
        return Optional.ofNullable(t).map(Timestamp::toInstant);
    }

    public Optional<Instant> restUntil(String provider) {
        return jdbc.query("select rest_until from ai_search_rest where provider = ?",
                (rs, i) -> rs.getTimestamp(1).toInstant(), provider).stream().findFirst();
    }

    public void rest(String provider, Instant until, String reason) {
        String why = reason == null ? null : reason.substring(0, Math.min(120, reason.length()));
        jdbc.update("insert into ai_search_rest (provider, rest_until, reason) values (?, ?, ?) "
                + "on duplicate key update rest_until = values(rest_until), reason = values(reason)",
                provider, Timestamp.from(until), why);
    }

    public void clear(String provider) {
        jdbc.update("delete from ai_search_rest where provider = ?", provider);
    }
}
