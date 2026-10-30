package com.maxsolch.shop.analytics.app;

import com.maxsolch.shop.platform.cache.CacheSpec;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.time.Duration;

/**
 * Single-value memos of the analytics readers (one entry under {@link #KEY}), kept in the shared Spring
 * {@code CacheManager}. Per-instance on purpose while the backend runs as one container (ARCHITECTURE.md, section 6).
 */
@Configuration
class AnalyticsReadCaches {

    static final String KEY = "all";

    /** Product/category titles used to name events; rebuilt at most every ten minutes. */
    static final CacheSpec TITLE_INDEX = new CacheSpec("analyticsTitleIndex", 1, Duration.ofMinutes(10));
    /** Facts of the metrics page; a burst of page opens reads the database once. */
    static final CacheSpec METRICS_FACTS = new CacheSpec("metricsFacts", 1, Duration.ofSeconds(15));
    /** Who of the visitors is staff (excluded from the numbers). */
    static final CacheSpec STAFF = new CacheSpec("staffVisitors", 1, Duration.ofMinutes(5));

    @Bean
    CacheSpec analyticsTitleIndexSpec() {
        return TITLE_INDEX;
    }

    @Bean
    CacheSpec metricsFactsSpec() {
        return METRICS_FACTS;
    }

    @Bean
    CacheSpec staffVisitorsSpec() {
        return STAFF;
    }
}
