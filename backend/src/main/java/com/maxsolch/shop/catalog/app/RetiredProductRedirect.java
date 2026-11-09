package com.maxsolch.shop.catalog.app;

import com.maxsolch.shop.catalog.domain.CatalogSnapshot;
import com.maxsolch.shop.catalog.domain.Product;
import com.maxsolch.shop.catalog.infra.ProductRepository;
import com.maxsolch.shop.platform.util.UuidUtil;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Locale;
import java.util.Optional;

/**
 * Where the site sends a product URL whose product was hidden or archived: its category page
 * (301), so search traffic and links that Google still has keep landing in the shop instead of
 * on a 404. The hidden product itself is never shown — only its category slug leaves here.
 */
@Service
public class RetiredProductRedirect {

    private final ProductRepository products;
    private final CatalogDirectory catalogDirectory;

    public RetiredProductRedirect(ProductRepository products, CatalogDirectory catalogDirectory) {
        this.products = products;
        this.catalogDirectory = catalogDirectory;
    }

    /** Category slug for a hidden/archived product; empty for an unknown slug, a live product or no category. */
    @Transactional(readOnly = true)
    public Optional<String> categorySlug(String slug) {
        if (slug == null || slug.isBlank()) {
            return Optional.empty();
        }
        return products.findFirstBySlug(slug.trim().toLowerCase(Locale.ROOT))
                .filter(RetiredProductRedirect::retired)
                .map(Product::getCategoryId)
                .map(id -> catalogDirectory.snapshot().category(UuidUtil.toString(id)))
                .map(CatalogSnapshot.Cat::slug);
    }

    private static boolean retired(Product p) {
        return !p.isActive() || p.isArchived();
    }
}
