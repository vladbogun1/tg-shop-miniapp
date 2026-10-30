package com.maxsolch.shop.customer.app;

import com.maxsolch.shop.platform.cache.CacheSpec;
import com.maxsolch.shop.platform.config.AppProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Caches of the customer module (sign-in and location), registered in the shared Spring {@code CacheManager}.
 * Both are per-instance on purpose (see docs/ARCHITECTURE.md, "Что остаётся в памяти"): losing them on a restart or
 * not sharing them between instances only costs one extra database write or one 401 that the next refresh heals.
 */
@Configuration
class CustomerCaches {

    /** Hashes of refresh tokens rotated away a moment ago: a parallel refresh (two tabs) is a race, not theft. */
    static final String WEB_ROTATED_REFRESH = "webRotatedRefresh";
    /** People whose location was written lately: one write per throttle window, not per request. */
    static final String VISITOR_LOCATION_RECENT = "visitorLocationRecent";

    static final CacheSpec ROTATED_REFRESH = new CacheSpec(WEB_ROTATED_REFRESH, 10_000, WebAuthService.ROTATION_GRACE);

    @Bean
    CacheSpec webRotatedRefreshCache() {
        return ROTATED_REFRESH;
    }

    @Bean
    CacheSpec visitorLocationRecentCache(AppProperties props) {
        return new CacheSpec(VISITOR_LOCATION_RECENT, 200_000, props.getGeoip().getThrottle());
    }
}
