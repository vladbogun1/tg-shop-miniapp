package com.maxsolch.shop.finance.domain;

import com.maxsolch.shop.order.domain.OrderMoney;

import java.time.Instant;
import java.util.List;
import java.util.Map;

/** Rows margin is computed from, and the per-order result. Plain data: no SQL, no Spring. */
public final class MarginRows {

    private MarginRows() {
    }

    public record OrderRow(String id, long totalMinor, long refundedMinor, long uncollectedMinor, String status,
                           boolean online, long prepaymentMinor) {

        public OrderRow(String id, long totalMinor, long refundedMinor, long uncollectedMinor, String status) {
            this(id, totalMinor, refundedMinor, uncollectedMinor, status, false, 0);
        }

        /** What the bank is to take the fee from: the prepayment, or the whole order when paid in full online. */
        public long onlineDueMinor() {
            return !online ? 0 : OrderMoney.dueOnlineMinor(totalMinor, prepaymentMinor);
        }

        /** What the order keeps: total minus refunds minus what was not collected at the post office. */
        public long revenue() {
            return OrderMoney.codMinor(totalMinor, uncollectedMinor, refundedMinor);
        }
    }

    public record ItemRow(long id, String orderId, String productId, String variantId, String title,
                          String variantName, long priceMinor, int qty, int returnedQty, int restockedQty,
                          boolean gift) {

        public int soldUnits() {
            return Math.max(0, qty - Math.max(0, returnedQty));
        }

        /** Units that left the shelf and did not come back (returned-and-written-off ones included). */
        public int unitsOut() {
            return Math.max(0, qty - Math.max(0, restockedQty));
        }
    }

    /** Units of one order line taken from one stock lot. */
    public record Alloc(long itemId, long lotId, int qty, Instant at) {
    }

    /** A credited online invoice of an order. */
    public record Invoice(String orderId, long amountMinor, long feeMinor) {
    }

    /** One order with everything needed for its profit. */
    public record Bundle(OrderRow order, List<ItemRow> items, Map<Long, List<Alloc>> allocs,
                         List<Invoice> invoices) {
    }

    /** Per-line result inside an order. */
    public record LineMoney(ItemRow item, long revenue, long cost, int unknownUnits, boolean preliminary,
                            List<Alloc> allocs) {
    }

    /** Profit of one order (not to be confused with {@code order.domain.OrderMoney}, the formulas). */
    public record OrderProfit(OrderRow order, List<LineMoney> lines, long revenue, long cost, long fee,
                              boolean feeEstimated, boolean complete, boolean preliminary) {

        public long profit() {
            return revenue - cost - fee;
        }
    }
}
