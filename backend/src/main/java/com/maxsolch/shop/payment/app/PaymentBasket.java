package com.maxsolch.shop.payment.app;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.maxsolch.shop.order.domain.Order;
import com.maxsolch.shop.order.domain.OrderItem;
import com.maxsolch.shop.payment.domain.MonobankGateway;
import com.maxsolch.shop.platform.util.UuidUtil;

import java.util.ArrayList;
import java.util.List;

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
        return of(order, amount, shortId, List.of());
    }

    static List<MonobankGateway.BasketItem> of(Order order, long amount, String shortId, List<Integer> tax) {
        List<MonobankGateway.BasketItem> lines = new ArrayList<>();
        long sum = 0;
        for (OrderItem it : order.getItems()) {
            if (it.getPriceMinorSnapshot() <= 0 || it.getQuantity() <= 0) {
                continue; // gifts
            }
            String name = it.getTitleSnapshot()
                    + (it.getVariantNameSnapshot() == null || it.getVariantNameSnapshot().isBlank()
                    ? "" : " (" + it.getVariantNameSnapshot() + ")");
            lines.add(new MonobankGateway.BasketItem(cut(name, 200), it.getQuantity(), it.getPriceMinorSnapshot(),
                    UuidUtil.toString(it.getProductId()), tax));
            sum += it.getPriceMinorSnapshot() * it.getQuantity();
        }
        if (sum == amount && !lines.isEmpty()) {
            return lines;
        }
        String title = amount < order.getTotalMinor() && order.getPrepaymentMinor() > 0
                ? "Передоплата за замовлення #" + shortId
                : "Оплата замовлення #" + shortId;
        return List.of(new MonobankGateway.BasketItem(title, 1, amount, "order-" + shortId, tax));
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
