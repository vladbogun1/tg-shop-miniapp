package com.maxsolch.shop.analytics.infra;

import com.maxsolch.shop.platform.cache.CacheSpec;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.time.Duration;

/**
 * Caches of the analytics module, registered in the shared Spring {@code CacheManager}. The schema facts (does a column
 * or table exist) only change with a redeploy, which restarts the process, so a long lifetime costs nothing.
 */
@Configuration
class AnalyticsCaches {

    /** Whether a column or table of the shop schema exists. */
    static final String SCHEMA_FACTS = "analyticsSchemaFacts";

    @Bean
    CacheSpec analyticsSchemaFactsCache() {
        return new CacheSpec(SCHEMA_FACTS, 100, Duration.ofHours(6));
    }
}
