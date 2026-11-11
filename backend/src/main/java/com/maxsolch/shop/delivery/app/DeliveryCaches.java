package com.maxsolch.shop.delivery.app;

import com.maxsolch.shop.platform.cache.CacheSpec;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.time.Duration;

/**
 * Caches of the delivery module, per instance (docs/ARCHITECTURE.md, «Что остаётся в памяти»): losing them costs
 * one extra Nova Poshta call.
 */
@Configuration
class DeliveryCaches {

    /** «≈ ціна доставки» by city + service + weight/size/value buckets. */
    static final String NP_PRICE = "npPrice";
    /** Courier street search by city + query. */
    static final String NP_STREETS = "npStreets";
    /** «NP did not answer a moment ago»: the checkout hints skip NP for this long instead of waiting 5 s each. */
    static final String NP_DOWN = "npDown";
    static final Duration DOWN_PAUSE = Duration.ofSeconds(60);

    @Bean
    CacheSpec npPriceCache() {
        return new CacheSpec(NP_PRICE, 5_000, Duration.ofHours(12));
    }

    @Bean
    CacheSpec npStreetsCache() {
        return new CacheSpec(NP_STREETS, 5_000, Duration.ofHours(24));
    }

    @Bean
    CacheSpec npDownCache() {
        return new CacheSpec(NP_DOWN, 10, DOWN_PAUSE);
    }
}
