package com.maxsolch.shop.catalog.app;

import com.maxsolch.shop.platform.tx.OnCommitted;
import com.maxsolch.shop.translation.domain.TranslationsChanged;
import org.springframework.cache.Cache;
import org.springframework.cache.CacheManager;
import org.springframework.stereotype.Component;

import java.util.List;

/** The catalog caches embed translated text: they are dropped once translations are committed. */
@Component
class CatalogTranslationListener {

    private static final List<String> CATALOG_CACHES = List.of("products", "productById", "catalogSchema");

    private final CacheManager cacheManager;

    CatalogTranslationListener(CacheManager cacheManager) {
        this.cacheManager = cacheManager;
    }

    @OnCommitted
    void onTranslationsChanged(TranslationsChanged event) {
        for (String name : CATALOG_CACHES) {
            Cache cache = cacheManager.getCache(name);
            if (cache != null) {
                cache.clear();
            }
        }
    }
}
