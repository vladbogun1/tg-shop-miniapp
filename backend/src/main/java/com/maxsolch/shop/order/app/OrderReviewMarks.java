package com.maxsolch.shop.order.app;

import com.maxsolch.shop.order.domain.DeliveredOrder;
import com.maxsolch.shop.order.infra.OrderReviewStore;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.List;

/**
 * What the review module may do with an order: take its once-only "bonus issued" and "reminder sent" marks, and ask
 * which delivered orders are waiting for a reminder. Runs in the caller's transaction, so a claim rolls back with it.
 */
@Service
public class OrderReviewMarks {

    private final OrderReviewStore store;

    public OrderReviewMarks(OrderReviewStore store) {
        this.store = store;
    }

    /** Takes the order's review bonus: true exactly once per order, even for concurrent callers. */
    public boolean claimBonus(byte[] orderId, Instant now) {
        return store.claimBonus(orderId, now);
    }

    /** Takes the order's review reminder: true exactly once per order. */
    public boolean claimReminder(byte[] orderId, Instant now) {
        return store.claimReminder(orderId, now);
    }

    /** Gives the reminder back after a send that failed: the next run tries again. */
    public void releaseReminder(byte[] orderId, Instant claimedAt) {
        store.releaseReminder(orderId, claimedAt);
    }

    /** Delivered orders in {@code [from, to]} with no reminder yet, a chat and a paid line left: oldest first, one page. */
    public List<DeliveredOrder> deliveredWithoutReminder(Instant from, Instant to, int limit, int offset) {
        return store.deliveredWithoutReminder(from, to, limit, offset);
    }
}
