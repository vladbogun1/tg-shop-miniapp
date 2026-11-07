package com.maxsolch.shop.ai.infra;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Taking jobs from the queue. {@code FOR UPDATE SKIP LOCKED}: two backend instances (the old and the new one during a
 * rollout) polling the same table never get the same row — what one has locked, the other skips. Must run inside the
 * caller's transaction: the row locks live until it commits.
 */
@Repository
public class AiJobClaims {

    /** How many queued candidates are looked at per slot: jobs of paused or busy batches are skipped, not claimed. */
    private static final int LOOK_AHEAD = 10;

    private record Candidate(long id, Long batchId, int parallel, int running) {
    }

    private final JdbcTemplate jdbc;

    public AiJobClaims(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * Ids of up to {@code limit} queued jobs, oldest first, locked for this transaction. A job of a batch is taken only
     * while its batch is RUNNING (a paused batch keeps its queued jobs until a person continues) and while fewer than the
     * batch's {@code parallel} of its jobs run, so a batch of thirty cannot crowd out single tasks.
     */
    public List<Long> lockQueued(int limit) {
        List<Candidate> rows = jdbc.query("""
                select j.id, j.batch_id, coalesce(b.parallel_jobs, 0),
                       (select count(*) from ai_jobs r where r.batch_id = j.batch_id and r.status = 'RUNNING')
                from ai_jobs j left join ai_batches b on b.id = j.batch_id
                where j.status = 'QUEUED' and (j.batch_id is null or b.status = 'RUNNING')
                order by j.id limit ? for update of j skip locked""",
                (rs, i) -> new Candidate(rs.getLong(1), rs.getObject(2) == null ? null : rs.getLong(2), rs.getInt(3),
                        rs.getInt(4)), limit * LOOK_AHEAD);
        Map<Long, Integer> taken = new HashMap<>();
        List<Long> out = new ArrayList<>();
        for (Candidate c : rows) {
            if (out.size() >= limit) {
                break;
            }
            if (c.batchId() != null && c.running() + taken.getOrDefault(c.batchId(), 0) >= c.parallel()) {
                continue;
            }
            if (c.batchId() != null) {
                taken.merge(c.batchId(), 1, Integer::sum);
            }
            out.add(c.id());
        }
        return out;
    }

    /** Jobs running right now on any instance. */
    public int running() {
        Integer n = jdbc.queryForObject("select count(*) from ai_jobs where status = 'RUNNING'", Integer.class);
        return n == null ? 0 : n;
    }
}
