package com.maxsolch.shop.catalog.app;

import org.springframework.lang.Nullable;

public record ProductVariantDto(@Nullable String id, String name, int stock, int sortOrder) {
}
