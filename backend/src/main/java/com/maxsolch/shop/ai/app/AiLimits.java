package com.maxsolch.shop.ai.app;

import com.maxsolch.shop.ai.domain.AiError;
import com.maxsolch.shop.ai.domain.AiEvents;
import com.maxsolch.shop.ai.domain.AiEvents.Period;
import com.maxsolch.shop.ai.domain.AiFeature;
import com.maxsolch.shop.ai.domain.AiJob;
import com.maxsolch.shop.ai.domain.JobMode;
import com.maxsolch.shop.ai.infra.AiLimitStore;
import com.maxsolch.shop.ai.infra.AiUsageRepository;
import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.platform.jobs.DbLocks;
import com.maxsolch.shop.platform.time.ShopZone;
import com.maxsolch.shop.platform.tx.DomainEvents;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Locale;

/**
 * The money guard: the day and the month (shop time zone) each have a limit (0 = none), and a running job counts
 * for the money it may still spend. "Allowed" means {@code spent + reserves of the other running jobs + what this one
 * asks for} within the limit; the check and the reserve happen under the database lock {@code ai-limits}, so three
 * jobs that start together cannot each see the same free money and together step over the limit (two backend
 * instances included). Search costs (paid Serper) are lines of the same journal and count too.
 */
@Service
public class AiLimits {

    static final String LOCK = "ai-limits";

    /** What has been spent in the day and in the month so far, micro-USD, and the open reserves of running jobs. */
    public record Spend(long dayMicroUsd, long monthMicroUsd, long reservesMicroUsd) {
    }

    private final AiUsageRepository spent;
    private final AiLimitStore reserves;
    private final AiUsageLog log;
    private final AiPolicy policy;
    private final AiEstimate estimate;
    private final DbLocks locks;
    private final DomainEvents events;
    private final Clock clock;
    private final ShopZone zone;

    public AiLimits(AiUsageRepository spent, AiLimitStore reserves, AiUsageLog log, AiPolicy policy,
                    AiEstimate estimate, DbLocks locks, DomainEvents events, Clock clock, ShopZone zone) {
        this.spent = spent;
        this.reserves = reserves;
        this.log = log;
        this.policy = policy;
        this.estimate = estimate;
        this.locks = locks;
        this.events = events;
        this.clock = clock;
        this.zone = zone;
    }

    /** Before every model turn of a running job: stop when the spend (with the others' reserves) has reached a limit. */
    public void ensureRoom(long jobId) {
        check(0, jobId, false, true);
    }

    /** At the start of a request: refuse at once when the expected cost of the job no longer fits (no event, no reserve). */
    public void preflight(AiFeature feature, JobMode mode, int items) {
        check(estimate.of(feature, mode, items).p90MicroUsd(), null, true, false);
    }

    /** A job starts running: check and take the reserve in one step under the lock. */
    public void reserve(AiJob job) {
        long reserve = estimate.of(job.getFeature(), job.getMode(), Math.max(1, job.getResearchItems())).p90MicroUsd();
        try (DbLocks.Held ignored = locks.lockWaiting(LOCK, Duration.ofSeconds(30), Duration.ofSeconds(10))
                .orElseThrow(() -> new DomainException.TooManyRequests(AiError.BUSY, 5))) {
            check(reserve, job.getId(), true, true);
            reserves.put(job.getId(), reserve);
        }
    }

    public void release(long jobId) {
        reserves.release(jobId);
    }

    public Spend spend() {
        long lost = log.lostMicroUsd();
        return new Spend(spent.spentSince(dayStart()) + lost, spent.spentSince(monthStart()) + lost,
                reserves.openReserves(null));
    }

    private void check(long extra, Long exceptJob, boolean strict, boolean publish) {
        long reserved = reserves.openReserves(exceptJob);
        long lost = log.lostMicroUsd();
        verify(Period.MONTH, policy.monthLimitMicro(), monthStart(), extra, reserved, lost, strict, publish);
        verify(Period.DAY, policy.dayLimitMicro(), dayStart(), extra, reserved, lost, strict, publish);
    }

    private void verify(Period period, long limit, Instant from, long extra, long reserved, long lost, boolean strict,
                        boolean publish) {
        if (limit <= 0) {
            return;
        }
        long already = spent.spentSince(from) + lost;
        long total = already + reserved + extra;
        if (strict ? total > limit : total >= limit) {
            if (publish) {
                events.publish(new AiEvents.LimitReached(period, already, limit));
            }
            AiError reason = period == Period.MONTH ? AiError.MONTH_LIMIT : AiError.DAY_LIMIT;
            throw new DomainException.Conflict(reason, usd(already), usd(limit));
        }
    }

    Instant dayStart() {
        return zone.now(clock).truncatedTo(ChronoUnit.DAYS).toInstant();
    }

    Instant monthStart() {
        return zone.now(clock).withDayOfMonth(1).truncatedTo(ChronoUnit.DAYS).toInstant();
    }

    private static String usd(long micro) {
        return String.format(Locale.ROOT, "%.2f", micro / 1_000_000.0);
    }
}
