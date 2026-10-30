package com.maxsolch.shop.preorder.app;

import com.maxsolch.shop.preorder.domain.PreorderSubscription;
import com.maxsolch.shop.preorder.infra.PreorderSubscriptionRepository;
import com.maxsolch.shop.preorder.domain.PreorderSubscription.Status;

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
    private final PreorderSubscriptionRepository subs;

    QueueStockHolds(PreorderQueueService queue, PreorderSubscriptionRepository subs) {
        this.queue = queue;
        this.subs = subs;
    }

    /**
     * Units of a line held for people other than {@code userId} (null = a guest / the admin): checkout
     * must leave them on the shelf. Read inside the order transaction after the product row is locked.
     */
    @Override
    public int heldForOthers(byte[] productId, byte[] variantId, Long userId) {
        // A locking read, not the aggregate: under REPEATABLE READ a plain SELECT shows the snapshot of the
        // order's first read, which may predate a hold that the expiry job released while we waited for the
        // product lock. FOR UPDATE reads the latest committed rows.
        return subs.lockQueue(productId, variantId).stream()
                .filter(s -> s.statusEnum() == Status.HELD && (userId == null || !userId.equals(s.getUserId())))
                .mapToInt(PreorderSubscription::getHeldQty).sum();
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
