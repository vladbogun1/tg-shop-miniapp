package com.maxsolch.shop.preorder.app;

import com.maxsolch.shop.catalog.domain.Product;
import com.maxsolch.shop.catalog.domain.ProductVariant;
import com.maxsolch.shop.preorder.domain.PreorderEvents;
import com.maxsolch.shop.preorder.domain.PreorderSubscription;
import com.maxsolch.shop.preorder.domain.PreorderSubscription.Status;
import com.maxsolch.shop.preorder.infra.PreorderSubscriptionRepository;
import com.maxsolch.shop.procurement.domain.BatchQueue;
import com.maxsolch.shop.procurement.domain.Lines;
import com.maxsolch.shop.procurement.domain.PreorderBatch.Distribution;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.Instant;
import java.util.Collection;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;

/**
 * The queue's answer to {@link BatchQueue}: procurement (below the pre-order module) asks, the queue hands
 * out holds, tells the people of a cancelled batch and counts who waits for which line.
 */
@Component
class QueueBatchPort implements BatchQueue {

    private final PreorderQueueService queue;
    private final PreorderSubscriptionRepository subs;
    private final ApplicationEventPublisher events;
    private final Clock clock;

    QueueBatchPort(PreorderQueueService queue, PreorderSubscriptionRepository subs, ApplicationEventPublisher events,
                   Clock clock) {
        this.queue = queue;
        this.subs = subs;
        this.events = events;
        this.clock = clock;
    }

    @Override
    public HandOut preview(byte[] productId, byte[] variantId, int stockAfter, Distribution mode) {
        return queue.previewHandOut(productId, variantId, stockAfter, mode);
    }

    @Override
    public HandOut handOut(Product product, ProductVariant variant, long batchId, Distribution mode, int holdHours) {
        return queue.handOut(product, variant, batchId, mode, holdHours, true);
    }

    @Override
    public void onBatchCancelled(Collection<byte[][]> lines, boolean closeQueue, Instant now) {
        Set<String> seen = new HashSet<>();
        for (byte[][] line : lines) {
            if (!seen.add(Lines.key(line[0], line[1]))) {
                continue;
            }
            for (PreorderSubscription s : subs.queue(line[0], line[1])) {
                if (s.statusEnum() != Status.WAITING) {
                    continue;
                }
                if (closeQueue) {
                    s.close(Status.CANCELLED, "поставка отменена", now);
                    subs.save(s);
                    events.publishEvent(new PreorderEvents.Closed(s.getId(), "BATCH_CANCELLED"));
                } else {
                    events.publishEvent(new PreorderEvents.BatchCancelledKept(s.getId()));
                }
            }
        }
    }

    @Override
    public Map<String, long[]> waitingByLine() {
        Map<String, long[]> out = new HashMap<>();
        for (Object[] r : subs.demand(clock.instant())) {
            out.put(Lines.key((byte[]) r[0], (byte[]) r[1]), new long[]{num(r[2]), num(r[3])});
        }
        return out;
    }

    private static long num(Object o) {
        return o == null ? 0 : ((Number) o).longValue();
    }
}
