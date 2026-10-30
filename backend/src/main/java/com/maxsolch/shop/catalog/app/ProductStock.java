package com.maxsolch.shop.catalog.app;

import com.maxsolch.shop.catalog.domain.Product;

import java.util.List;

/**
 * What the catalog needs from the stock ledger. Declared here, implemented by the inventory module, so that
 * the catalog does not depend on a module built on top of it.
 */
public interface ProductStock {

    /** FIFO stock lots follow a stock typed by hand. */
    void syncLots(Product product);

    /**
     * Lowering stock by hand needs a reason: without one (or "other" without a note) the call is refused with
     * 400 {@code STOCK_REASON_REQUIRED}; every drop leaves a write-off row valued at the current price.
     */
    void recordDrops(Product product, List<StockDrop> drops, String reason, String note);

    /** Units a stock edit took off the shelf: a variant (id + name) or, with nulls, the product itself. */
    record StockDrop(byte[] variantId, String variantName, int quantity) {
    }
}
