package com.maxsolch.shop.web.dto;

import java.time.Instant;
import com.maxsolch.shop.catalog.CatalogDtos.BrandRefDto;

import java.util.List;
import java.util.Map;

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

    /**
     * Menu category (flat, tree order: each root followed by its children). {@code productCount} =
     * active products of the subtree. The virtual «Уценка» comes last with {@code id = "utsenka"}.
     */
    /**
     * Lightweight product for listings ({@code GET /api/public/products?view=card}): no description,
     * SEO, condition note or tags; at most the first two images.
     */
    public record ProductCardDto(String id, String slug, String title, long priceMinor, Long compareAtMinor,
                                 String currency, int stock, List<ProductVariantDto> variants,
                                 List<ProductImageDto> images, Double ratingAvg, int ratingCount, long soldCount,
                                 Instant createdAt, String categoryId, BrandRefDto brandRef, String condition,
                                 Map<String, Object> specs) {

        public static ProductCardDto of(ProductDto p) {
            List<ProductImageDto> images = p.images() == null ? List.of()
                    : p.images().subList(0, Math.min(2, p.images().size()));
            return new ProductCardDto(p.id(), p.slug(), p.title(), p.priceMinor(), p.compareAtMinor(), p.currency(),
                    p.stock(), p.variants(), images, p.ratingAvg(), p.ratingCount(), p.soldCount(), p.createdAt(),
                    p.categoryId(), p.brandRef(), p.condition(), p.specs());
        }
    }

    /** {@link ProductPage} with {@link ProductCardDto} items. */
    public record ProductCardPage(List<ProductCardDto> items, long total, int page, int size, long priceMaxAvailable) {

        public static ProductCardPage of(ProductPage page) {
            return new ProductCardPage(page.items().stream().map(ProductCardDto::of).toList(), page.total(),
                    page.page(), page.size(), page.priceMaxAvailable());
        }
    }

    public record CategoryDto(String id, String slug, String name, int sortOrder, long productCount,
                              String parentId, String artKind, boolean showInMenu) {
    }

    /**
     * One category with the SEO of its page (V36, translated like the name). Null SEO fields = the
     * site uses its template. Separate from {@link CategoryDto} because the menu list goes into every
     * page and the intro text is long.
     */
    public record CategoryDetailDto(String id, String slug, String name, int sortOrder, long productCount,
                                    boolean showInMenu, String seoTitle, String seoDescription, String h1,
                                    String introText, String parentId, String artKind) {
    }

    public record SitemapProduct(String slug, Instant updatedAt) {
    }

    /** Only categories that have public products; {@code updatedAt} = newest product change. */
    public record SitemapCategory(String slug, Instant updatedAt) {
    }

    public record SitemapDto(List<SitemapProduct> products, List<SitemapCategory> categories) {
    }
}
