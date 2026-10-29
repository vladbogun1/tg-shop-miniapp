package com.maxsolch.shop.inventory.domain;

import com.maxsolch.shop.domain.Product;
import com.maxsolch.shop.domain.ProductVariant;

/**
 * Units of the shelf promised to people waiting in a queue (pre-orders). Inventory moves stock and asks
 * this port whenever a move touches such promises; the pre-order module implements it (it sits above
 * inventory, so it cannot be called the other way round). Every method runs inside the caller's
 * transaction with the product row already locked.
 */
public interface StockHolds {

    /** Units of a line held for people other than {@code userId} (null = a guest or an admin). */
    int heldForOthers(byte[] productId, byte[] variantId, Long userId);

    /** Units left the shelf outside checkout: holds the rest no longer covers go back to waiting. */
    void onStockTaken(Product product, ProductVariant variant, int stockAfter);

    /** Units came back to the shelf outside a batch: the queue gets them as holds. */
    void onStockReturned(Product product, ProductVariant variant);
}
