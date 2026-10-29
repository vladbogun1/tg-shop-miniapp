package com.maxsolch.shop.procurement.domain;

import com.maxsolch.shop.domain.Product;
import com.maxsolch.shop.domain.ProductVariant;

import java.time.Instant;
import java.util.Collection;
import java.util.Map;

/**
 * What a batch needs from the people waiting for its goods. Procurement sits below the pre-order module, so it
 * cannot call the queue; it asks this port and the pre-order module answers. Every method runs inside the caller's
 * transaction (an arrival has the product row locked).
 */
public interface BatchQueue {

    /** Who got what from an arrival (or its preview): holds for {@code heldPeople} people, {@code freeAfter} left to sell. */
    record HandOut(int heldPeople, int heldQty, int notifiedPeople, int shortPeople, int freeAfter) {
    }

    /** What an arrival of this size would hand out; writes nothing. */
    HandOut preview(byte[] productId, byte[] variantId, int stockAfter, PreorderBatch.Distribution mode);

    /** The goods of a batch arrived (stock already raised): holds go to the people in line, they are notified. */
    HandOut handOut(Product product, ProductVariant variant, long batchId, PreorderBatch.Distribution mode, int holdHours);

    /**
     * A batch was cancelled: the people waiting for its lines are told and, with {@code closeQueue}, taken off the
     * queues; otherwise they stay waiting for the product without a date. {@code lines} are {@code [productId, variantId]}.
     */
    void onBatchCancelled(Collection<byte[][]> lines, boolean closeQueue, Instant now);

    /** Per line key ({@link Lines#key}): {@code [people, units]} waiting or holding. */
    Map<String, long[]> waitingByLine();
}
