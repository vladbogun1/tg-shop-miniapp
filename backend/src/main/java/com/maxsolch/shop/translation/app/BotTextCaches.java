package com.maxsolch.shop.translation.app;

import com.maxsolch.shop.platform.cache.CacheSpec;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.time.Duration;

/**
 * The edited Russian bot texts ({@link BotTexts}), one entry in the shared Spring {@code CacheManager}. Dropped
 * explicitly when the "Translations" tab saves; the lifetime is only a safety net (it used to be unlimited), so a
 * text changed straight in the database shows up within the hour.
 */
@Configuration
class BotTextCaches {

    static final String KEY = "ruOverrides";

    static final CacheSpec RU_OVERRIDES = new CacheSpec("botTextOverrides", 1, Duration.ofHours(1));

    @Bean
    CacheSpec botTextOverridesCache() {
        return RU_OVERRIDES;
    }
}
