package com.maxsolch.shop.ai.infra;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/** Counts over a batch's jobs that the batch rules need (the plain list reads go through the repositories). */
@Repository
public class AiBatchQueries {

    private final JdbcTemplate jdbc;

    public AiBatchQueries(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** Jobs of the batch that are still queued or running. */
    public int active(long batchId) {
        Integer n = jdbc.queryForObject("select count(*) from ai_jobs where batch_id = ? and status in ('QUEUED', 'RUNNING')",
                Integer.class, batchId);
        return n == null ? 0 : n;
    }

    /** Jobs of the batch that ended with DONE (they wait for the review or were applied). */
    public int done(long batchId) {
        Integer n = jdbc.queryForObject("select count(*) from ai_jobs where batch_id = ? and status = 'DONE'",
                Integer.class, batchId);
        return n == null ? 0 : n;
    }

    /**
     * True when the last {@code jobs} ended jobs of the batch searched at least {@code minSearches} times and not one
     * search gave a result: the provider is blocked or down, and going on would only fill the cards with empty answers.
     */
    public boolean searchBlind(long batchId, int jobs, int minSearches) {
        return jdbc.query("""
                select count(*), coalesce(sum(u.result = 'OK'), 0) from ai_usage u
                where u.kind = 'SEARCH' and u.job_id in (
                    select id from (select id from ai_jobs where batch_id = ? and finished_at is not null
                                    order by finished_at desc, id desc limit ?) t)""",
                (rs, i) -> rs.getInt(1) >= minSearches && rs.getInt(2) == 0, batchId, jobs).stream().findFirst().orElse(false);
    }

    /** Sum of the money (micro-USD) the jobs of the batch have cost so far. */
    public long spentMicro(long batchId) {
        Long v = jdbc.queryForObject("select coalesce(sum(cost_micro_usd), 0) from ai_jobs where batch_id = ?",
                Long.class, batchId);
        return v == null ? 0 : v;
    }
}
