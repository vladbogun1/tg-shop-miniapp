package com.maxsolch.shop.platform.settings;

import com.maxsolch.shop.platform.cache.CacheSpec;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.time.Duration;

/**
 * The two memos of {@link SettingsService}, one entry each, in the shared Spring {@code CacheManager}:
 * the snapshot of all rows (fresh for {@link SettingsService#MAX_AGE}) and the last snapshot that was read
 * successfully, which answers when the table cannot be read. The second one used to live as long as the process;
 * it now expires after a week, which is longer than any outage the defaults would be a better answer for.
 */
@Configuration
class SettingsCaches {

    static final String KEY = "all";

    static final CacheSpec SNAPSHOT = new CacheSpec("settingsSnapshot", 1, SettingsService.MAX_AGE);
    static final CacheSpec LAST_GOOD = new CacheSpec("settingsLastGood", 1, Duration.ofDays(7));

    @Bean
    CacheSpec settingsSnapshotCache() {
        return SNAPSHOT;
    }

    @Bean
    CacheSpec settingsLastGoodCache() {
        return LAST_GOOD;
    }
}
