package com.maxsolch.shop.analytics.app;

import com.maxsolch.shop.platform.cache.CacheConfig;
import org.springframework.cache.Cache;
import org.springframework.cache.CacheManager;
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

    private final MetricsFactsQueries queries;
    private final Clock clock;
    private final Cache memo;

    public MetricsFactsLoader(MetricsFactsQueries queries, Clock clock, CacheManager caches) {
        this.memo = CacheConfig.require(caches, AnalyticsReadCaches.METRICS_FACTS.name());
        this.queries = queries;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public MetricsFacts load() {
        MetricsFacts cached = memo.get(AnalyticsReadCaches.KEY, MetricsFacts.class);
        if (cached != null) {
            return new MetricsFacts(cached.orders(), cached.items(), cached.products(), cached.users(),
                    cached.invoices(), clock.instant());
        }
        MetricsFacts fresh = new MetricsFacts(queries.loadOrders(), queries.loadItems(), queries.loadProducts(),
                queries.loadUsers(), queries.loadInvoices(), clock.instant());
        memo.put(AnalyticsReadCaches.KEY, fresh);
        return fresh;
    }

    /** Whether {@code orders.<column>} exists (cached; columns only appear with a redeploy). */
    boolean hasOrderColumn(String column) {
        return queries.hasOrderColumn(column);
    }
}
