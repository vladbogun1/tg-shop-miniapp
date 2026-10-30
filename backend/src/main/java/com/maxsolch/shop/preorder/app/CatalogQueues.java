package com.maxsolch.shop.preorder.app;

import com.maxsolch.shop.catalog.app.HeldUnits;
import com.maxsolch.shop.catalog.app.ProductQueues;
import org.springframework.stereotype.Component;

import java.util.Map;

/** Gives the catalog (which sits below pre-orders) what it needs to know about queues, behind its own ports. */
@Component
class CatalogQueues implements ProductQueues, HeldUnits {

    private final PreorderQueueService queue;
    private final WaitingCounts waiting;

    CatalogQueues(PreorderQueueService queue, WaitingCounts waiting) {
        this.queue = queue;
        this.waiting = waiting;
    }

    @Override
    public void closeFor(byte[] productId) {
        queue.closeForProduct(productId);
    }

    @Override
    public Map<String, int[]> waitingByProduct() {
        return waiting.byProduct();
    }

    @Override
    public Map<String, Integer> heldByLine() {
        return queue.heldByLine();
    }
}
