package com.maxsolch.shop.catalog.app;

import com.maxsolch.shop.translation.domain.ContentLocale;

/**
 * The language part of the catalog cache keys, called from {@code @Cacheable(key = ...)} expressions (which reach it by
 * its own name, so the dependency on the translation module is an ordinary import, visible to the architecture rules).
 */
public final class CacheLang {

    /** SpEL for the cache key of a method with a {@code lang} parameter. */
    public static final String KEY = "T(com.maxsolch.shop.catalog.app.CacheLang).of(#lang)";

    private CacheLang() {
    }

    public static String of(String lang) {
        return ContentLocale.normalize(lang);
    }
}
