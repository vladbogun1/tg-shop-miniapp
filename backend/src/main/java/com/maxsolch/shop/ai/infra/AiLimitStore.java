package com.maxsolch.shop.ai.infra;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/**
 * The reserves of running jobs ({@code ai_reserve}, V88). A job's reserve counts only what it has not yet spent:
 * {@code max(0, reserve - what its lines in ai_usage already cost)} — so the money is never counted twice. Plain
 * statements without a transaction of their own: each commits at once, which is what the caller needs when it holds
 * the database lock {@code ai-limits} around check-and-reserve.
 */
@Repository
public class AiLimitStore {

    private final JdbcTemplate jdbc;

    public AiLimitStore(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** Unspent reserves of every running job except {@code exceptJobId} (null = none excluded), micro-USD. */
    public long openReserves(Long exceptJobId) {
        Long sum = jdbc.queryForObject("""
                select coalesce(sum(greatest(0, r.reserve_micro
                         - coalesce((select sum(u.cost_micro_usd) from ai_usage u where u.job_id = r.job_id), 0))), 0)
                from ai_reserve r where r.job_id <> ?""", Long.class, exceptJobId == null ? -1L : exceptJobId);
        return sum == null ? 0 : sum;
    }

    public void put(long jobId, long reserveMicro) {
        jdbc.update("insert into ai_reserve (job_id, reserve_micro, created_at) values (?, ?, current_timestamp(6)) "
                + "on duplicate key update reserve_micro = values(reserve_micro)", jobId, reserveMicro);
    }

    public void release(long jobId) {
        jdbc.update("delete from ai_reserve where job_id = ?", jobId);
    }

    /** Reserves whose job is no longer running (it died, was requeued or finished): nobody will release them. */
    public int deleteOrphans() {
        return jdbc.update("delete r from ai_reserve r left join ai_jobs j on j.id = r.job_id "
                + "where j.id is null or j.status <> 'RUNNING'");
    }
}
