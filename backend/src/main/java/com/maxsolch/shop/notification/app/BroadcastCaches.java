package com.maxsolch.shop.notification.app;

import com.maxsolch.shop.platform.cache.CacheSpec;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Caches of the notification module, registered in the shared Spring {@code CacheManager}. A separate
 * configuration: the store itself needs the manager, and the manager needs the specs.
 */
@Configuration
class BroadcastCaches {

    @Bean
    CacheSpec broadcastPhotosSpec() {
        return BroadcastPhotoStore.SPEC;
    }
}
