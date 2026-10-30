package com.maxsolch.shop.catalog.app;

import org.springframework.lang.Nullable;

public record ProductImageDto(@Nullable Long id, @Nullable String url, int sortOrder) {
}
