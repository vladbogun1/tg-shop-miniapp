package com.maxsolch.shop.procurement.infra;

import com.maxsolch.shop.platform.cache.CacheSpec;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.time.Duration;

/** Caches of the procurement module, registered in the shared Spring {@code CacheManager}. */
@Configuration
class ProcurementCaches {

    /** Official NBU rate of one currency on one day ("USD@2026-10-30"): the bank does not revise a day, so a day is enough. */
    static final String NBU_RATES = "nbuRates";

    @Bean
    CacheSpec nbuRatesCache() {
        return new CacheSpec(NBU_RATES, 2_000, Duration.ofDays(1));
    }
}
