package com.maxsolch.shop.catalog.app;

import com.maxsolch.shop.catalog.domain.Product;
import com.maxsolch.shop.catalog.infra.ProductQuickSearch;
import com.maxsolch.shop.platform.util.UuidUtil;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/** What other modules (the admin «go to» box) may ask the catalog: a few products by title or article number. */
@Service
public class AdminProductLookup {

    /** One product in the quick search. */
    public record ProductHit(String id, String title, String sku, long priceMinor, String currency, int stock,
                             boolean active) {
    }

    private final ProductQuickSearch search;

    public AdminProductLookup(ProductQuickSearch search) {
        this.search = search;
    }

    @Transactional(readOnly = true)
    public List<ProductHit> find(String q, int limit) {
        if (q == null || q.isBlank()) {
            return List.of();
        }
        return search.find(q, limit).stream().map(AdminProductLookup::hit).toList();
    }

    private static ProductHit hit(Product p) {
        return new ProductHit(UuidUtil.toString(p.getId()), p.getTitle(), p.getSku(), p.getPriceMinor(),
                p.getCurrency(), p.getStock(), p.isActive());
    }
}
