package com.maxsolch.shop.ai.infra;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.List;

/**
 * Taking jobs from the queue. {@code FOR UPDATE SKIP LOCKED}: two backend instances (the old and the new one during a
 * rollout) polling the same table never get the same row — what one has locked, the other skips. Must run inside the
 * caller's transaction: the row locks live until it commits.
 */
@Repository
public class AiJobClaims {

    private final JdbcTemplate jdbc;

    public AiJobClaims(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** Ids of up to {@code limit} queued jobs, oldest first, locked for this transaction. */
    public List<Long> lockQueued(int limit) {
        return jdbc.queryForList("select id from ai_jobs where status = 'QUEUED' order by id limit ? for update skip locked",
                Long.class, limit);
    }

    /** Jobs running right now on any instance. */
    public int running() {
        Integer n = jdbc.queryForObject("select count(*) from ai_jobs where status = 'RUNNING'", Integer.class);
        return n == null ? 0 : n;
    }
}
