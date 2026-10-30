package com.maxsolch.shop.catalog.domain;

import java.util.List;

/** Stored files (product photos, a brand logo) that nothing refers to any more: deleted once the change commits. */
public record CatalogFilesDropped(List<String> keys) {
}
