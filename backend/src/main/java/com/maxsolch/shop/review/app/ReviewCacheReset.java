package com.maxsolch.shop.review.app;

import com.maxsolch.shop.platform.tx.OnCommitted;
import com.maxsolch.shop.review.domain.ReviewEvents;
import org.springframework.cache.Cache;
import org.springframework.cache.CacheManager;
import org.springframework.stereotype.Component;

/** After a product's rating changed and committed, the catalog caches that carry it are dropped. */
@Component
public class ReviewCacheReset {

    private final CacheManager cacheManager;

    public ReviewCacheReset(CacheManager cacheManager) {
        this.cacheManager = cacheManager;
    }

    @OnCommitted
    public void on(ReviewEvents.RatingChanged event) {
        clear("products");
        clear("productById");
    }

    private void clear(String cacheName) {
        Cache cache = cacheManager.getCache(cacheName);
        if (cache != null) {
            cache.clear();
        }
    }
}
