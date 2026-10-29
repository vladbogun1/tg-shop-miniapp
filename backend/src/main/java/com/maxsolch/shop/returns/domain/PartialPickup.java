package com.maxsolch.shop.returns.domain;

import com.maxsolch.shop.order.domain.Order;
import com.maxsolch.shop.order.domain.OrderItem;
import com.maxsolch.shop.order.domain.OrderMoney;

import java.util.IdentityHashMap;
import java.util.List;
import java.util.Map;

/**
 * The customer refuses part of a shipped parcel at the post branch: what that part is worth and when it is a
 * refused parcel instead. Pure rules over an order and the wizard lines.
 */
public final class PartialPickup {

    private PartialPickup() {
    }

    /** Every paid unit of a shipped order would be refused — that is a refused parcel, not a partial pickup. */
    public static boolean nothingPickedUp(Order order, List<WizardLine> lines) {
        for (OrderItem item : order.getItems()) {
            if (item.isGift() || item.getId() == null) {
                continue;
            }
            int back = lines.stream()
                    .filter(l -> l.itemId() == item.getId() && l.outcome() != LineOutcome.KEPT)
                    .mapToInt(WizardLine::quantity).sum();
            if (item.getQuantity() - item.getReturnedQty() - back > 0) {
                return false;
            }
        }
        return true;
    }

    /**
     * Paid value of the units of a shipped order the customer refused at the branch (partial
     * pickup): every line that comes back, wherever it is now; a compensation (KEPT) is not one.
     * The value of an item's units follows {@link OrderMoney#paidForUnitsMinor}, so refusing the
     * same line in several steps adds up to its exact paid amount.
     *
     * @param applied the lines are already counted in {@code returnedQty} (called after the wizard
     *                booked them); otherwise they are not yet
     */
    public static long refusedValueMinor(Order order, List<WizardLine> lines, boolean applied) {
        Map<OrderItem, Integer> units = new IdentityHashMap<>();
        for (WizardLine l : lines) {
            if (l.outcome() == LineOutcome.KEPT || l.quantity() <= 0) {
                continue;
            }
            order.getItems().stream()
                    .filter(i -> i.getId() != null && i.getId() == l.itemId())
                    .findFirst()
                    .ifPresent(item -> units.merge(item, l.quantity(), Integer::sum));
        }
        long sum = 0;
        for (Map.Entry<OrderItem, Integer> e : units.entrySet()) {
            OrderItem item = e.getKey();
            int already = applied ? item.getReturnedQty() - e.getValue() : item.getReturnedQty();
            sum += OrderMoney.paidForUnitsMinor(order, item, already, e.getValue());
        }
        return sum;
    }
}
