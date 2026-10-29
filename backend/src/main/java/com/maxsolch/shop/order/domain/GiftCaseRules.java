package com.maxsolch.shop.order.domain;

import java.util.Optional;

/** What the order says about its gift case (V57): states, error codes and the questions the screens ask. */
public final class GiftCaseRules {

    public static final String GIFT_CASE_SEALED = "SEALED";
    public static final String GIFT_CASE_OPENED = "OPENED";
    public static final String GIFT_CASE_NONE = "GIFT_CASE_NONE";
    public static final String GIFT_CASE_UNPAID = "GIFT_CASE_UNPAID";
    public static final String GIFT_CASE_ALREADY_OPENED = "GIFT_CASE_ALREADY_OPENED";
    public static final String GIFT_CASE_SWAP_UNAVAILABLE = "GIFT_CASE_SWAP_UNAVAILABLE";
    public static final String GIFT_CASE_SIZE_UNAVAILABLE = "GIFT_CASE_SIZE_UNAVAILABLE";

    private GiftCaseRules() {
    }

    /** A sealed case can be opened: the order is paid (online part arrived) and not rejected. */
    public static boolean giftCaseOpenable(Order order) {
        if (!GIFT_CASE_SEALED.equals(order.getGiftCaseStatus()) || order.getStatus() == OrderStatus.REJECTED) {
            return false;
        }
        return order.isPaid() || (order.getReceivedMinor() > 0 && OrderMoney.amountDueMinor(order) == 0);
    }

    /** The prize line of the order's case (a product prize that is still in the order). */
    public static Optional<OrderItem> casePrizeLine(Order order) {
        return order.getItems().stream().filter(i -> i.isAutoGift() && i.getCaseRarity() != null).findFirst();
    }

    /** Swapping the case prize is possible while the order is still being put together. */
    public static boolean giftCaseSwappable(Order order) {
        return GIFT_CASE_OPENED.equals(order.getGiftCaseStatus())
                && OrderTransitions.isOpen(order)
                && casePrizeLine(order).isPresent();
    }
}
