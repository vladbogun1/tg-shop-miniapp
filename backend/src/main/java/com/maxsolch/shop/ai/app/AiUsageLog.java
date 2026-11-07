package com.maxsolch.shop.ai.app;

import com.maxsolch.shop.ai.domain.AiScope;
import com.maxsolch.shop.ai.domain.AiUsage;
import com.maxsolch.shop.ai.domain.TokenUsage;
import com.maxsolch.shop.ai.infra.AiProperties;
import com.maxsolch.shop.ai.infra.AiUsageRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.util.concurrent.atomic.AtomicLong;

/**
 * The journal of external calls (table {@code ai_usage}). A row is written right after the call,
 * outside any business transaction: the money is spent whether or not the caller's work succeeds. A failed write does
 * not fail the call (the answer the admin waited a minute for is not thrown away), but it is not silent either: a WARN
 * with the sum, and the lost money is counted in memory and added to the spend, so the limits are not understated.
 */
@Slf4j
@Service
public class AiUsageLog {

    private final AiUsageRepository repo;
    private final AiProperties props;
    private final Clock clock;
    /** Rows that could not be written since start, and their cost: shown on the status screen, counted in the limit. */
    private final AtomicLong lostRows = new AtomicLong();
    private final AtomicLong lostMicroUsd = new AtomicLong();

    public AiUsageLog(AiUsageRepository repo, AiProperties props, Clock clock) {
        this.repo = repo;
        this.props = props;
        this.clock = clock;
    }

    /** Writes the model call and returns its cost, micro-USD. */
    public long model(AiScope scope, TokenUsage tokens, long ms, String failure) {
        AiProperties.Model m = props.getModel();
        long cost = tokens.costMicroUsd(m.getInputPerM(), m.getCachedPerM(), m.getOutputPerM());
        save(AiUsage.model(clock.instant(), scope, m.getName(), tokens, cost, ms, failure));
        return cost;
    }

    public void call(AiScope scope, AiUsage.Kind kind, String provider, AiUsage.Result result, long costMicroUsd,
                     long ms, String note) {
        save(AiUsage.call(clock.instant(), scope, kind, provider, result, costMicroUsd, ms, note));
    }

    /** Rows that could not be written since this instance started, and their cost (counted in the limits). */
    public long lostRows() {
        return lostRows.get();
    }

    public long lostMicroUsd() {
        return lostMicroUsd.get();
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
