package com.maxsolch.shop.ai.app;

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

/**
 * The journal of external calls (table {@code ai_usage}) and the monthly limit. A row is written right after the call,
 * outside any business transaction: the money is spent whether or not the caller's work succeeds. A failed write is
 * logged and swallowed — losing one journal line must not lose the answer the admin waited a minute for.
 */
@Slf4j
@Service
public class AiUsageLog {

    private final AiUsageRepository repo;
    private final AiProperties props;
    private final Clock clock;
    private final ShopZone zone;

    public AiUsageLog(AiUsageRepository repo, AiProperties props, Clock clock, ShopZone zone) {
        this.repo = repo;
        this.props = props;
        this.clock = clock;
        this.zone = zone;
    }

    /** Writes the model call and returns its cost, micro-USD. */
    public long model(String feature, TokenUsage tokens, long ms, String failure) {
        AiProperties.Model m = props.getModel();
        long cost = tokens.costMicroUsd(m.getInputPerM(), m.getCachedPerM(), m.getOutputPerM());
        save(AiUsage.model(clock.instant(), feature, m.getName(), tokens, cost, ms, failure));
        return cost;
    }

    public void call(String feature, AiUsage.Kind kind, String provider, AiUsage.Result result, long costMicroUsd,
                     long ms, String note) {
        save(AiUsage.call(clock.instant(), feature, kind, provider, result, costMicroUsd, ms, note));
    }

    /** Throws when this month's spend has reached the limit; called before every model request. */
    public void ensureWithinLimit() {
        long limitMicro = props.getMonthLimitCents() * 10_000;
        if (limitMicro <= 0) {
            return;
        }
        long spent = repo.spentSince(monthStart());
        if (spent >= limitMicro) {
            throw new DomainException.Conflict(AiError.MONTH_LIMIT, usd(spent), usd(limitMicro));
        }
    }

    public record MonthSummary(Instant from, long spentMicroUsd, long limitMicroUsd, List<UsageLine> lines) {
    }

    public MonthSummary month() {
        Instant from = monthStart();
        return new MonthSummary(from, repo.spentSince(from), props.getMonthLimitCents() * 10_000,
                repo.summarySince(from));
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
            log.warn("ai_usage row lost ({} {}): {}", row.getKind(), row.getProvider(), e.toString());
        }
    }
}
