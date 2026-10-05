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

    /**
     * One category with the SEO of its page (V36, translated like the name). Null SEO fields = the
     * site uses its template. Separate from {@link CategoryDto} because the menu list goes into every
     * page and the intro text is long.
     */
    public record CategoryDetailDto(String id, String slug, String name, int sortOrder, long productCount,
                                    boolean showInMenu, String seoTitle, String seoDescription, String h1,
                                    String introText) {
    }

    public record SitemapProduct(String slug, Instant updatedAt) {
    }

    /** Only categories that have public products; {@code updatedAt} = newest product change. */
    public record SitemapCategory(String slug, Instant updatedAt) {
    }

    public record SitemapDto(List<SitemapProduct> products, List<SitemapCategory> categories) {
    }
}
