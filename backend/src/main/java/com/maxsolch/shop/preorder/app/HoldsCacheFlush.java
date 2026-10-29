package com.maxsolch.shop.preorder.app;

import com.maxsolch.shop.platform.tx.OnCommitted;
import com.maxsolch.shop.preorder.domain.PreorderEvents;
import com.maxsolch.shop.site.SiteRevalidator;
import org.springframework.cache.Cache;
import org.springframework.cache.CacheManager;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * The catalog caches stock: a hold that appears or goes away changes what the shop shows as available. After the
 * transaction of the hand-out commits (before that another request would cache the old numbers again) the cached
 * catalog is dropped and the site pages of the product are rebuilt. Without a transaction it runs at once.
 */
@Component
class HoldsCacheFlush {

    private final CacheManager cacheManager;
    private final SiteRevalidator siteRevalidator;

    HoldsCacheFlush(CacheManager cacheManager, SiteRevalidator siteRevalidator) {
        this.cacheManager = cacheManager;
        this.siteRevalidator = siteRevalidator;
    }

    @OnCommitted
    void on(PreorderEvents.HoldsChanged event) {
        for (String name : List.of("products", "productById")) {
            Cache c = cacheManager.getCache(name);
            if (c != null) {
                c.clear();
            }
        }
        siteRevalidator.productChanged(event.productSlug(), null, null);
    }
}
