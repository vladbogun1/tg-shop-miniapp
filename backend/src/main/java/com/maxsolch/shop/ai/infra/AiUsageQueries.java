package com.maxsolch.shop.ai.infra;

import com.maxsolch.shop.ai.domain.AiFeature;
import com.maxsolch.shop.ai.domain.JobTotals;
import com.maxsolch.shop.ai.domain.TokenUsage;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;

/** Read-only sums over {@code ai_usage} and the finished jobs: per job, per provider, and the history for estimates. */
@Repository
public class AiUsageQueries {

    private final JdbcTemplate jdbc;

    public AiUsageQueries(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** What the lines of one job add up to (the rate is the caller's to set). */
    public JobTotals totals(long jobId) {
        return jdbc.queryForObject("""
                select coalesce(sum(cost_micro_usd), 0), coalesce(sum(input_tokens), 0), coalesce(sum(cached_tokens), 0),
                       coalesce(sum(output_tokens), 0), coalesce(sum(kind = 'MODEL'), 0),
                       coalesce(sum(kind = 'SEARCH'), 0), coalesce(sum(kind = 'PAGE'), 0)
                from ai_usage where job_id = ?""",
                (rs, i) -> new JobTotals(rs.getLong(1), 0,
                        new TokenUsage(rs.getInt(2), rs.getInt(3), rs.getInt(4)), rs.getInt(5), rs.getInt(6),
                        rs.getInt(7), false), jobId);
    }

    /** Spent by one job so far, micro-USD. */
    public long spentByJob(long jobId) {
        Long v = jdbc.queryForObject("select coalesce(sum(cost_micro_usd), 0) from ai_usage where job_id = ?",
                Long.class, jobId);
        return v == null ? 0 : v;
    }

    /** Requests the paid provider has answered since the start (the free pack of 2500 is not renewed monthly). */
    public int searchesBy(String provider) {
        Integer n = jdbc.queryForObject("select count(*) from ai_usage where kind = 'SEARCH' and provider = ? "
                + "and result <> 'FAILED'", Integer.class, provider);
        return n == null ? 0 : n;
    }

    /** Costs of the latest finished jobs of a feature (cheapest first), micro-USD: the sample for p50 / p90. */
    public List<Long> recentCosts(AiFeature feature, Instant since, int limit) {
        return jdbc.queryForList("select cost_micro_usd from (select cost_micro_usd from ai_jobs "
                        + "where feature = ? and status in ('DONE', 'EMPTY', 'BAD_ANSWER') and finished_at >= ? "
                        + "order by id desc limit ?) t order by cost_micro_usd",
                Long.class, feature.name(), Timestamp.from(since), limit);
    }
}
