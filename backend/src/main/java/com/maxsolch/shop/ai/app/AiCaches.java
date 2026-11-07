package com.maxsolch.shop.ai.app;

import com.maxsolch.shop.platform.cache.CacheSpec;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.time.Duration;

/**
 * Per-instance state of the AI module (ARCHITECTURE.md, section 6: losing it costs a repeated request, not money):
 * <ul>
 *   <li>{@link #SEARCH_COOLDOWN} — a search provider that just failed stays out of the chain for 10 minutes, the
 *       entry expires by itself; a second instance would try it once more and put it on its own cooldown.</li>
 *   <li>{@link #JOBS} — answers of running and finished AI jobs for the admin to poll; an hour is plenty to read
 *       one, a lost one is asked again (a card costs ~0.2 UAH).</li>
 * </ul>
 */
@Configuration
class AiCaches {

    static final CacheSpec SEARCH_COOLDOWN = new CacheSpec("aiSearchCooldown", 16, Duration.ofMinutes(10));
    static final CacheSpec JOBS = new CacheSpec("aiJobs", 500, Duration.ofHours(1));

    @Bean
    CacheSpec aiSearchCooldownCache() {
        return SEARCH_COOLDOWN;
    }

    @Bean
    CacheSpec aiJobsCache() {
        return JOBS;
    }
}
