package com.maxsolch.shop.ai.app;

import com.maxsolch.shop.ai.domain.AiFeature;
import com.maxsolch.shop.ai.domain.AiError;
import com.maxsolch.shop.ai.domain.AiUsage;
import com.maxsolch.shop.ai.domain.TokenUsage;
import com.maxsolch.shop.ai.domain.UsageLine;
import com.maxsolch.shop.ai.infra.AiProperties;
import com.maxsolch.shop.ai.infra.AiUsageRepository;
import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.platform.time.ShopZone;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;

/**
 * The journal of external calls (table {@code ai_usage}) and the monthly limit. A row is written right after the call,
 * outside any business transaction: the money is spent whether or not the caller's work succeeds. A failed write does
 * not fail the call (the answer the admin waited a minute for is not thrown away), but it is not silent either: a WARN
 * with the sum, and the lost money is counted in memory and added to the month's spend, so the limit is not understated.
 */
@Slf4j
@Service
public class AiUsageLog {

    private final AiUsageRepository repo;
    private final AiProperties props;
    private final Clock clock;
    private final ShopZone zone;
    /** Rows that could not be written since start, and their cost: shown on the status screen, counted in the limit. */
    private final AtomicLong lostRows = new AtomicLong();
    private final AtomicLong lostMicroUsd = new AtomicLong();

    public AiUsageLog(AiUsageRepository repo, AiProperties props, Clock clock, ShopZone zone) {
        this.repo = repo;
        this.props = props;
        this.clock = clock;
        this.zone = zone;
    }

    /** Writes the model call and returns its cost, micro-USD. */
    public long model(AiFeature feature, TokenUsage tokens, long ms, String failure) {
        AiProperties.Model m = props.getModel();
        long cost = tokens.costMicroUsd(m.getInputPerM(), m.getCachedPerM(), m.getOutputPerM());
        save(AiUsage.model(clock.instant(), feature, m.getName(), tokens, cost, ms, failure));
        return cost;
    }

    public void call(AiFeature feature, AiUsage.Kind kind, String provider, AiUsage.Result result, long costMicroUsd,
                     long ms, String note) {
        save(AiUsage.call(clock.instant(), feature, kind, provider, result, costMicroUsd, ms, note));
    }

    /** Throws when this month's spend has reached the limit; called before every model request. */
    public void ensureWithinLimit() {
        long limitMicro = props.getMonthLimitCents() * 10_000;
        if (limitMicro <= 0) {
            return;
        }
        long spent = repo.spentSince(monthStart()) + lostMicroUsd.get();
        if (spent >= limitMicro) {
            throw new DomainException.Conflict(AiError.MONTH_LIMIT, usd(spent), usd(limitMicro));
        }
    }

    public record MonthSummary(Instant from, long spentMicroUsd, long limitMicroUsd, List<UsageLine> lines,
                               long lostRows) {
    }

    public MonthSummary month() {
        Instant from = monthStart();
        return new MonthSummary(from, repo.spentSince(from) + lostMicroUsd.get(), props.getMonthLimitCents() * 10_000,
                repo.summarySince(from), lostRows.get());
    }

    private Instant monthStart() {
        return zone.now(clock).withDayOfMonth(1).truncatedTo(ChronoUnit.DAYS).toInstant();
    }

    private static String usd(long micro) {
        return String.format(java.util.Locale.ROOT, "%.2f", micro / 1_000_000.0);
    }

    private void save(AiUsage row) {
        try {
            repo.save(row);
        } catch (RuntimeException e) {
            lostRows.incrementAndGet();
            lostMicroUsd.addAndGet(row.getCostMicroUsd());
            log.warn("ai_usage row lost ({} {} {}, {} micro-USD): {}", row.getFeature(), row.getKind(),
                    row.getProvider(), row.getCostMicroUsd(), e.toString());
        }
    }
}
