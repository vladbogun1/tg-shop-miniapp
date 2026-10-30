package com.maxsolch.shop.catalog.app;

import com.maxsolch.shop.catalog.domain.CardStatus;
import com.maxsolch.shop.catalog.domain.CatalogError;
import com.maxsolch.shop.catalog.domain.Product;
import com.maxsolch.shop.catalog.domain.SpecsJson;
import com.maxsolch.shop.platform.error.DomainException;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * The publishing gate of a product and its card status, shared by the admin form ({@link AdminProductService}) and
 * the cards import ({@link CardsImporter}): turning a product active needs a price and a category
 * ({@code PRODUCT_NOT_PUBLISHABLE}) and a card that is not a DRAFT ({@code CARD_NOT_READY}, bypassed by
 * {@code force}).
 */
final class ProductPublishing {

    private ProductPublishing() {
    }

    /** What is missing to publish: {@code price} (must be &gt; 0) and {@code category}. Empty = ok. */
    static List<String> missingForPublish(Product p) {
        List<String> missing = new ArrayList<>();
        if (p.getPriceMinor() <= 0) {
            missing.add("price");
        }
        if (p.getCategoryId() == null) {
            missing.add("category");
        }
        return missing;
    }

    /** Gate of the transition to active (see the class comment). */
    static void checkPublishable(Product p, boolean force) {
        List<String> missing = missingForPublish(p);
        if (!missing.isEmpty()) {
            throw (missing.size() > 1
                    ? new DomainException.Conflict(CatalogError.NOT_PUBLISHABLE_NO_PRICE_NO_CATEGORY).withDetails(Map.of("missing", missing))
                    : missing.contains("price")
                            ? new DomainException.Conflict(CatalogError.NOT_PUBLISHABLE_NO_PRICE).withDetails(Map.of("missing", missing))
                            : new DomainException.Conflict(CatalogError.NOT_PUBLISHABLE_NO_CATEGORY).withDetails(Map.of("missing", missing)));
        }
        if (!force && (p.getCardStatus() == null || p.getCardStatus() == CardStatus.DRAFT)) {
            throw new DomainException.Conflict(CatalogError.CARD_NOT_READY);
        }
    }

    /** An unfinished product stops being one once it is published or archived (V53). */
    static void syncUnfinished(Product p) {
        if (p.isActive() || p.isArchived()) {
            p.setUnfinished(false);
        }
    }

    /** Sets the card status; READY records who reviewed it and when (card_meta). */
    static void setStatus(Product p, CardStatus st, Long adminId, Instant now) {
        p.setCardStatus(st);
        if (st == CardStatus.READY) {
            Map<String, Object> meta = SpecsJson.readMap(p.getCardMetaJson());
            meta.put("reviewedAt", now.toString());
            if (adminId != null) {
                meta.put("reviewedBy", adminId);
            }
            p.setCardMetaJson(SpecsJson.write(meta));
        }
    }
}
