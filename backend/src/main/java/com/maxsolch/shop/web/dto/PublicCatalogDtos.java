package com.maxsolch.shop.web.dto;

import java.time.Instant;
import java.util.List;

/** Response shapes of the public site catalog ({@code /api/public/**}). */
public final class PublicCatalogDtos {

    private PublicCatalogDtos() {
    }

    /** One page of products + what the price slider needs. */
    public record ProductPage(
            List<ProductDto> items,
            long total,
            int page,
            int size,
            /** Highest price in the selection ignoring {@code priceMax} (slider upper bound). */
            long priceMaxAvailable) {
    }

    public record CategoryDto(String id, String slug, String name, int sortOrder, long productCount) {
    }

    public record SitemapProduct(String slug, Instant updatedAt) {
    }

    public record SitemapCategory(String slug) {
    }

    public record SitemapDto(List<SitemapProduct> products, List<SitemapCategory> categories) {
    }
}
