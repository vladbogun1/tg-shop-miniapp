package com.maxsolch.shop.analytics.metrics;

import com.maxsolch.shop.domain.OrderStatus;

import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Everything the metrics calculators read, loaded once per request as lean rows (no entities).
 *
 * <p>The whole order history is a few thousand rows; loading it flat and aggregating in Java keeps
 * every calculator a pure function that can be unit-tested with hand-made rows, and lets one
 * definition ("sold" = not rejected, by creation date) be applied identically everywhere.
 */
public record MetricsFacts(List<OrderFact> orders,
                           List<ItemFact> items,
                           List<ProductFact> products,
                           List<UserFact> users,
                           Instant now) {

    /**
     * One order. {@code refundedMinor}/{@code returnedAt}/{@code rejectReasonCode} come from columns
     * that package B adds; until they exist they are 0/null.
     */
    public record OrderFact(String id,
                            OrderStatus status,
                            String source,
                            long totalMinor,
                            long subtotalMinor,
                            long discountMinor,
                            long receivedMinor,
                            long refundedMinor,
                            Instant createdAt,
                            Instant approvedAt,
                            Instant shippedAt,
                            Instant deliveredAt,
                            Instant rejectedAt,
                            Instant paidAt,
                            Instant returnedAt,
                            boolean paid,
                            boolean paymentClaimed,
                            Long tgUserId,
                            String customerName,
                            String tgUsername,
                            String deliveryMethod,
                            String paymentOptionTitle,
                            String promoCode,
                            String rejectReason,
                            String rejectReasonCode) {

        public boolean rejected() {
            return status == OrderStatus.REJECTED;
        }

        /** Share of the item prices actually charged after the promo discount (1 when unknown). */
        public double chargedShare() {
            if (subtotalMinor <= 0) {
                return 1.0;
            }
            return Math.max(0.0, Math.min(1.0, (double) (subtotalMinor - discountMinor) / subtotalMinor));
        }
    }

    public record ItemFact(String orderId,
                           String productId,
                           String variantId,
                           String title,
                           String variantName,
                           long priceMinor,
                           int quantity,
                           boolean gift) {
    }

    public record VariantFact(String id, String name, int stock) {
    }

    public record ProductFact(String id,
                              String title,
                              long priceMinor,
                              int stock,
                              boolean active,
                              boolean archived,
                              Instant createdAt,
                              List<String> tags,
                              List<VariantFact> variants) {

        /** On the storefront: active and not archived. */
        public boolean live() {
            return active && !archived;
        }
    }

    public record UserFact(long telegramUserId, Instant createdAt) {
    }

    public Map<String, OrderFact> orderById() {
        Map<String, OrderFact> map = new HashMap<>(orders.size() * 2);
        for (OrderFact o : orders) {
            map.put(o.id(), o);
        }
        return map;
    }

    public Map<String, List<ItemFact>> itemsByOrder() {
        Map<String, List<ItemFact>> map = new HashMap<>();
        for (ItemFact it : items) {
            map.computeIfAbsent(it.orderId(), k -> new ArrayList<>()).add(it);
        }
        return map;
    }

    public Map<String, ProductFact> productById() {
        Map<String, ProductFact> map = new HashMap<>(products.size() * 2);
        for (ProductFact p : products) {
            map.put(p.id(), p);
        }
        return map;
    }
}
