package com.maxsolch.shop.preorder.app;

import com.maxsolch.shop.preorder.domain.PreorderEvents;
import com.maxsolch.shop.site.app.SiteRevalidator;
import org.junit.jupiter.api.Test;
import org.springframework.cache.Cache;
import org.springframework.cache.CacheManager;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** A change of holds drops the cached catalog and rebuilds the product's site pages. */
class HoldsCacheFlushTest {

    @Test
    void dropsTheCatalogCachesAndRevalidatesTheProduct() {
        CacheManager caches = mock(CacheManager.class);
        Cache products = mock(Cache.class);
        Cache byId = mock(Cache.class);
        when(caches.getCache("products")).thenReturn(products);
        when(caches.getCache("productById")).thenReturn(byId);
        SiteRevalidator site = mock(SiteRevalidator.class);

        new HoldsCacheFlush(caches, site).on(new PreorderEvents.HoldsChanged("lamzu-maya"));

        verify(products).clear();
        verify(byId).clear();
        verify(site).productChanged("lamzu-maya", null, null);
    }

    @Test
    void aMissingCacheIsNotAnError() {
        CacheManager caches = mock(CacheManager.class);
        SiteRevalidator site = mock(SiteRevalidator.class);

        new HoldsCacheFlush(caches, site).on(new PreorderEvents.HoldsChanged("lamzu-maya"));

        verify(site).productChanged("lamzu-maya", null, null);
    }
}
