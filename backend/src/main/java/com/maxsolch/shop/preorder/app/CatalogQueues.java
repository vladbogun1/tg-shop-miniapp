package com.maxsolch.shop.preorder.app;

import com.maxsolch.shop.preorder.infra.PreorderSubscriptionRepository;
import com.maxsolch.shop.procurement.domain.Lines;
import java.util.HashMap;

import com.maxsolch.shop.catalog.app.HeldUnits;
import com.maxsolch.shop.catalog.app.ProductQueues;
import org.springframework.stereotype.Component;

import java.util.Map;

/** Gives the catalog (which sits below pre-orders) what it needs to know about queues, behind its own ports. */
@Component
class CatalogQueues implements ProductQueues, HeldUnits {

    private final PreorderQueueService queue;
    private final WaitingCounts waiting;
    private final PreorderSubscriptionRepository subs;

    CatalogQueues(PreorderQueueService queue, WaitingCounts waiting, PreorderSubscriptionRepository subs) {
        this.subs = subs;
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

    /** Units on hold per line ({@link #lineKey}) — the catalog subtracts them from the stock it shows. */
    @Override
    public Map<String, Integer> heldByLine() {
        Map<String, Integer> out = new HashMap<>();
        for (Object[] row : subs.heldByLine()) {
            out.put(Lines.key((byte[]) row[0], (byte[]) row[1]), ((Number) row[2]).intValue());
        }
        return out;
    }
}
