package com.maxsolch.shop.preorder.app;

import com.maxsolch.shop.catalog.domain.Product;
import com.maxsolch.shop.catalog.domain.ProductVariant;
import com.maxsolch.shop.inventory.domain.StockHolds;
import org.springframework.stereotype.Component;

/**
 * Pre-order side of the {@link StockHolds} port: inventory asks, the queue answers. Pre-order sits above
 * inventory, so this is how the shelf learns about holds without knowing the queue exists.
 */
@Component
class QueueStockHolds implements StockHolds {

    private final PreorderQueueService queue;

    QueueStockHolds(PreorderQueueService queue) {
        this.queue = queue;
    }

    @Override
    public int heldForOthers(byte[] productId, byte[] variantId, Long userId) {
        return queue.heldForOthers(productId, variantId, userId);
    }

    @Override
    public void onStockTaken(Product product, ProductVariant variant, int stockAfter) {
        queue.onStockTaken(product, variant, stockAfter);
    }

    @Override
    public void onStockReturned(Product product, ProductVariant variant) {
        queue.onStockReturned(product, variant);
    }
}
