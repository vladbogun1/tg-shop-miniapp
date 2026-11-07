package com.maxsolch.shop.catalog.app;

import com.maxsolch.shop.catalog.domain.ProductBrief;
import com.maxsolch.shop.catalog.infra.ProductBriefStore;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.util.Collection;
import java.util.Map;
import java.util.Optional;

/**
 * What the review screens ask the catalog: the brief of a product, its id by slug, and writing the rating the
 * catalog DTOs read from the product row. Runs in the caller's transaction.
 */
@Service
public class ProductBriefs {

    private final ProductBriefStore store;

    public ProductBriefs(ProductBriefStore store) {
        this.store = store;
    }

    public Optional<byte[]> idBySlug(String slug) {
        return store.idBySlug(slug);
    }

    /** Briefs by id (UUID string); a deleted product is absent. */
    public Map<String, ProductBrief> briefs(Collection<byte[]> productIds) {
        return store.briefs(productIds);
    }

    /** Ids of products whose title matches the lower-case LIKE pattern (backslash escape); at most {@code limit}. */
    public java.util.List<byte[]> idsByTitleLike(String like, int limit) {
        return store.idsByTitleLike(like, limit);
    }

    /** Sets the product's published-review count and average ({@code avg} null while there are none). */
    public void setRating(byte[] productId, int count, BigDecimal avg) {
        store.setRating(productId, count, avg);
    }
}
