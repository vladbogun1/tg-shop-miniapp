package com.maxsolch.shop.analytics.app;

import com.maxsolch.shop.analytics.domain.MetricsFacts;
import com.maxsolch.shop.analytics.infra.MetricsFactsQueries;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;

/**
 * Loads {@link MetricsFacts} through {@link MetricsFactsQueries} (plain SQL, one query per table).
 *
 * <p>The snapshot is memoised for a few seconds: the metrics page fires several tab requests at
 * once and the board's "Today" strip polls, all reading the same rows.
 */
@Slf4j
@Component
public class MetricsFactsLoader {

    private static final long MEMO_MILLIS = 15_000;

    private final MetricsFactsQueries queries;
    private final Clock clock;
    private volatile MetricsFacts memo;
    private volatile long memoAt;

    public MetricsFactsLoader(MetricsFactsQueries queries, Clock clock) {
        this.queries = queries;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public MetricsFacts load() {
        long nowMs = System.currentTimeMillis();
        MetricsFacts cached = memo;
        if (cached != null && nowMs - memoAt < MEMO_MILLIS) {
            return new MetricsFacts(cached.orders(), cached.items(), cached.products(), cached.users(),
                    cached.invoices(), clock.instant());
        }
        MetricsFacts fresh = new MetricsFacts(queries.loadOrders(), queries.loadItems(), queries.loadProducts(),
                queries.loadUsers(), queries.loadInvoices(), clock.instant());
        memo = fresh;
        memoAt = nowMs;
        return fresh;
    }

    /** Whether {@code orders.<column>} exists (cached; columns only appear with a redeploy). */
    boolean hasOrderColumn(String column) {
        return queries.hasOrderColumn(column);
    }
}
