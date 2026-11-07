package com.maxsolch.shop.ai.infra;

import com.maxsolch.shop.ai.domain.AiFeature;
import com.maxsolch.shop.ai.domain.JobFact;
import com.maxsolch.shop.ai.domain.JobPath;
import com.maxsolch.shop.ai.domain.JobStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

/**
 * Read-only aggregates for the «ИИ» tab of the metrics: the finished jobs of a period (the totals each job wrote when
 * it ended, so the line-by-line journal is not scanned), the results nobody has looked at, and the per-provider sums
 * of the journal (asked only when the owner opens the details). {@code testAdmin} is the technical admin whose
 * test runs are left out unless asked for; null = nobody is left out.
 */
@Repository
public class AiMetricsQueries {

    /** What the results waiting for a decision look like: how many, the oldest, how many are older than a moment. */
    public record Waiting(long count, Instant oldest, long stale) {
    }

    /** A provider's calls in a period; money in micro-USD. */
    public record ProviderLine(String kind, String provider, long calls, long failed, long costMicroUsd,
                               long inputTokens, long outputTokens) {
    }

    private final JdbcTemplate jdbc;

    public AiMetricsQueries(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** Jobs that finished in {@code [from, to)}, with their outcome. */
    public List<JobFact> facts(Instant from, Instant to, Long testAdmin) {
        List<Object> args = new ArrayList<>(List.of(Timestamp.from(from), Timestamp.from(to)));
        String skip = skipTest("j.admin_id", testAdmin, args);
        return jdbc.query("""
                select j.id, j.feature, j.path, j.status, j.error_code, j.cost_micro_usd, j.rate_milli, j.finished_at,
                       j.outcome, coalesce(j.outcome_applied, 0), coalesce(j.outcome_rejected, 0),
                       coalesce(j.outcome_edited, 0), j.outcome_at,
                       exists(select 1 from ai_jobs r where r.retry_of = j.id)
                from ai_jobs j where j.finished_at >= ? and j.finished_at < ?""" + skip + " order by j.finished_at",
                AiMetricsQueries::fact, args.toArray());
    }

    /**
     * Ready results with no decision yet, of the built-in AI and pasted from ChatGPT (any age); {@code staleBefore}:
     * older than this is «stale».
     */
    public Waiting waiting(Instant staleBefore, Long testAdmin) {
        List<Object> args = new ArrayList<>(List.of(Timestamp.from(staleBefore)));
        String skip = skipTest("admin_id", testAdmin, args);
        return jdbc.queryForObject("""
                select count(*), min(finished_at), coalesce(sum(finished_at < ?), 0)
                from ai_jobs where (path = 'BUILTIN' or pasted = 1) and status = 'DONE' and outcome is null""" + skip,
                (rs, i) -> new Waiting(rs.getLong(1), instant(rs, 2), rs.getLong(3)), args.toArray());
    }

    /** Calls of the journal per kind and provider in {@code [from, to)}. */
    public List<ProviderLine> providers(Instant from, Instant to, Long testAdmin) {
        List<Object> args = new ArrayList<>(List.of(Timestamp.from(from), Timestamp.from(to)));
        // a call outside a job (the search check) has no admin: it stays in
        String skip = testAdmin == null ? "" : " and (admin_id is null or admin_id <> ?)";
        if (testAdmin != null) {
            args.add(testAdmin);
        }
        return jdbc.query("""
                select kind, provider, count(*), coalesce(sum(result = 'FAILED'), 0), coalesce(sum(cost_micro_usd), 0),
                       coalesce(sum(input_tokens), 0), coalesce(sum(output_tokens), 0)
                from ai_usage where created_at >= ? and created_at < ?""" + skip + """
                 group by kind, provider order by kind, provider""",
                (rs, i) -> new ProviderLine(rs.getString(1), rs.getString(2), rs.getLong(3), rs.getLong(4),
                        rs.getLong(5), rs.getLong(6), rs.getLong(7)), args.toArray());
    }

    private static String skipTest(String column, Long testAdmin, List<Object> args) {
        if (testAdmin == null) {
            return "";
        }
        args.add(testAdmin);
        return " and " + column + " <> ?";
    }

    private static JobFact fact(ResultSet rs, int row) throws SQLException {
        return new JobFact(rs.getLong(1), AiFeature.valueOf(rs.getString(2)), JobPath.valueOf(rs.getString(3)),
                JobStatus.valueOf(rs.getString(4)), rs.getString(5), rs.getLong(6), rs.getInt(7), instant(rs, 8),
                rs.getString(9), rs.getInt(10), rs.getInt(11), rs.getInt(12), instant(rs, 13), rs.getBoolean(14));
    }

    private static Instant instant(ResultSet rs, int col) throws SQLException {
        Timestamp t = rs.getTimestamp(col);
        return t == null ? null : t.toInstant();
    }
}
