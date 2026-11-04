package com.maxsolch.shop.payment.app;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.maxsolch.shop.order.domain.Order;
import com.maxsolch.shop.order.domain.OrderItem;
import com.maxsolch.shop.payment.domain.MonobankGateway;
import com.maxsolch.shop.payment.domain.PaymentInvoice;
import com.maxsolch.shop.platform.util.UuidUtil;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static com.maxsolch.shop.platform.util.Texts.cut;

/**
 * The basket of a monobank invoice (the lines of the payment page and of the fiscal receipt) and its copy stored
 * on the invoice ({@code basket_json}), read back for the return receipt of a full refund.
 */
final class PaymentBasket {

    private static final ObjectMapper JSON = new ObjectMapper();

    private PaymentBasket() {
    }

    /**
     * The basket shown on the payment page. Itemised when the lines add up to exactly the amount
     * (full payment, no discount); otherwise one line "оплата замовлення" — monobank (and a fiscal
     * receipt) needs the lines to sum to the invoice amount.
     */
    static List<MonobankGateway.BasketItem> of(Order order, long amount, String shortId) {
        return of(order, amount, shortId, List.of(), List.of());
    }

    /**
     * The same, knowing the order's earlier invoices: a top-up (an item added to a paid order) is itemised with
     * what was added — the lines minus the units already paid in an applied invoice — when those add up to the
     * amount; the receipt then names the goods, not «Оплата замовлення».
     */
    static List<MonobankGateway.BasketItem> of(Order order, long amount, String shortId, List<Integer> tax,
                                               List<PaymentInvoice> earlier) {
        List<MonobankGateway.BasketItem> lines = lines(order, tax);
        if (sum(lines) == amount && !lines.isEmpty()) {
            return lines;
        }
        List<MonobankGateway.BasketItem> added = minusPaid(lines, earlier);
        if (sum(added) == amount && !added.isEmpty()) {
            return added;
        }
        String title = order.getReceivedMinor() > 0 ? "Доплата за замовлення #" + shortId
                : amount < order.getTotalMinor() && order.getPrepaymentMinor() > 0
                ? "Передоплата за замовлення #" + shortId
                : "Оплата замовлення #" + shortId;
        return List.of(new MonobankGateway.BasketItem(title, 1, amount, "order-" + shortId, tax));
    }

    /** Every paid line of the order (gifts left out), at its price. */
    private static List<MonobankGateway.BasketItem> lines(Order order, List<Integer> tax) {
        List<MonobankGateway.BasketItem> lines = new ArrayList<>();
        for (OrderItem it : order.getItems()) {
            if (it.getPriceMinorSnapshot() <= 0 || it.getQuantity() <= 0) {
                continue; // gifts
            }
            String name = it.getTitleSnapshot()
                    + (it.getVariantNameSnapshot() == null || it.getVariantNameSnapshot().isBlank()
                    ? "" : " (" + it.getVariantNameSnapshot() + ")");
            lines.add(new MonobankGateway.BasketItem(cut(name, 200), it.getQuantity(), it.getPriceMinorSnapshot(),
                    UuidUtil.toString(it.getProductId()), tax));
        }
        return lines;
    }

    /** {@code lines} without the units an applied earlier invoice already paid for (same product, name and price). */
    private static List<MonobankGateway.BasketItem> minusPaid(List<MonobankGateway.BasketItem> lines,
                                                              List<PaymentInvoice> earlier) {
        Map<String, Long> paid = new HashMap<>();
        for (PaymentInvoice inv : earlier) {
            if (inv.getAppliedAt() == null || inv.getBasketJson() == null) {
                continue;
            }
            try {
                for (MonobankGateway.BasketItem b : read(inv.getBasketJson())) {
                    paid.merge(key(b), b.qty(), Long::sum);
                }
            } catch (Exception e) {
                return List.of(); // an unreadable basket: no itemised top-up
            }
        }
        List<MonobankGateway.BasketItem> added = new ArrayList<>();
        for (MonobankGateway.BasketItem line : lines) {
            long left = line.qty() - paid.getOrDefault(key(line), 0L);
            if (left > 0) {
                added.add(new MonobankGateway.BasketItem(line.name(), left, line.sum(), line.code(), line.tax()));
            }
        }
        return added;
    }

    private static String key(MonobankGateway.BasketItem b) {
        return b.code() + "|" + b.name() + "|" + b.sum();
    }

    /** What the lines add up to (monobank's {@code sum} is the price of one unit). */
    private static long sum(List<MonobankGateway.BasketItem> lines) {
        return lines.stream().mapToLong(b -> b.sum() * b.qty()).sum();
    }

    /** The basket as stored on the invoice; null when it cannot be written. */
    static String toJson(List<MonobankGateway.BasketItem> basket) {
        try {
            return JSON.writeValueAsString(basket);
        } catch (Exception e) {
            return null;
        }
    }

    /** The stored basket of an invoice, as written by {@link #toJson}. */
    static List<MonobankGateway.BasketItem> read(String json) throws Exception {
        return JSON.readValue(json, new TypeReference<List<MonobankGateway.BasketItem>>() { });
    }
}
