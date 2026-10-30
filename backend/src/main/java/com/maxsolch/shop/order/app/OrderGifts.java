package com.maxsolch.shop.order.app;

import com.maxsolch.shop.order.domain.Order;

import java.util.List;
import java.util.Optional;
import java.util.function.LongSupplier;

/**
 * What the order asks of the gift module (docs/GIFT-CASE.md), declared here because the gift sits above the order:
 * the order must not know the gift's classes. The gift module answers with plain {@link Decision}s; the order
 * applies them (a line at price 0, the tier, the SEALED status) in its own transaction, so the prize is drawn,
 * placed and recorded exactly where it was before — in the checkout / the admin's «give a case» transaction.
 */
public interface OrderGifts {

    String CHOICE_DISCOUNT = "DISCOUNT";
    /** An exchange replacement earns no gift: the goods were paid for in the first order. */
    String CHOICE_NONE = "NONE";

    /** The gift for the order sum; empty = switched off or nothing to give. */
    Optional<ThresholdPlan> thresholdPlan();

    /**
     * A case of the tier (a name; anything unknown = SILVER) for the admin to give by hand.
     *
     * @throws com.maxsolch.shop.platform.error.DomainException.BadRequest when the tier has no prizes
     */
    CasePlan casePlan(String tierName);

    /** What is left of the monthly gift limit of the person of the order, kopecks; {@link Long#MAX_VALUE} without a limit. */
    long limitLeft(Order order);

    /** The order's prize record goes away together with its case. */
    void deleteCase(byte[] orderId);

    /** An unused code the order's case gave is switched off (the order was rejected). */
    void revokeCasePromo(byte[] orderId);

    /** Can this product be given away now (visible, in stock) and costs no more than {@code maxPriceMinor}? Asked by the gift. */
    interface Gate {
        boolean allows(String productId, long maxPriceMinor);
    }

    /** Writes the prize record once the order has its id. */
    interface Recorder {
        void save(byte[] orderId, String productTitle);
    }

    interface ThresholdPlan {

        /** Every product the checkout may give away: the order locks them up front, in id order. */
        List<String> productIds();

        /**
         * Decides the gift of an order of {@code totalMinor}: the guaranteed discount when the customer chose it,
         * otherwise a prize of the dearest reached tier that can drop (a cheaper one when none can), else the
         * single gift product.
         *
         * @param limitLeft read only when a gift product could be given (the discount choice does not need it)
         */
        Decision decide(long totalMinor, String choice, Gate gate, LongSupplier limitLeft, boolean lowMargin);
    }

    interface CasePlan {

        String tier();

        /** The products its prizes may be (locked in id order before the draw). */
        List<String> productIds();

        /** Draws a prize among those that can drop (a discount always can); empty when none can. */
        Optional<Decision.Prize> draw(Gate gate, long limitLeft, boolean lowMargin);
    }

    /** The outcome of a draw, in the order's own words. */
    sealed interface Decision {

        /** Nothing for this order. */
        record None() implements Decision {
        }

        /** The customer took the guaranteed discount of the tier instead of a case. */
        record Discount(String tier, long amountMinor) implements Decision {
        }

        /** A single gift product goes in as a line at price 0, no case. */
        record ProductGift(String productId) implements Decision {
        }

        /**
         * A case prize: a product ({@code productId}) goes in as a line at price 0, a discount waits for the
         * opening; {@code rarity} marks the line. {@code recorder} keeps the prize record.
         */
        record Prize(String tier, String productId, String rarity, Recorder recorder) implements Decision {
        }
    }
}
