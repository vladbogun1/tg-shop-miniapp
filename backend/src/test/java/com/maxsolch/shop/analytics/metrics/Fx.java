package com.maxsolch.shop.analytics.metrics;

import com.maxsolch.shop.analytics.metrics.MetricsFacts.ItemFact;
import com.maxsolch.shop.analytics.metrics.MetricsFacts.OrderFact;
import com.maxsolch.shop.analytics.metrics.MetricsFacts.ProductFact;
import com.maxsolch.shop.analytics.metrics.MetricsFacts.VariantFact;
import com.maxsolch.shop.domain.OrderStatus;

import java.time.Instant;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;

/** Test fixtures: hand-made order/item/product rows for the pure metric calculators. */
final class Fx {

    static final ZoneId KYIV = ZoneId.of("Europe/Kyiv");
    private static final AtomicInteger SEQ = new AtomicInteger();

    private Fx() {
    }

    /** Mutable order builder; {@link #build()} makes the immutable fact. */
    static final class O {
        String id = "o" + SEQ.incrementAndGet();
        OrderStatus status = OrderStatus.DELIVERED;
        String source = "MINIAPP";
        long total = 100_00;
        long subtotal = 0;
        long discount = 0;
        long received = 0;
        long refunded = 0;
        Instant created;
        Instant approved;
        Instant shipped;
        Instant delivered;
        Instant rejectedAt;
        Instant paidAt;
        Instant returnedAt;
        boolean paid;
        boolean claimed;
        Long tg = 1L;
        String delivery = "NOVA_POSHTA";
        String payment;
        String promo;
        String reason;
        String reasonCode;

        O(Instant created) {
            this.created = created;
        }

        O status(OrderStatus s) {
            status = s;
            return this;
        }

        O total(long minor) {
            total = minor;
            return this;
        }

        O source(String s) {
            source = s;
            return this;
        }

        O tg(Long id) {
            tg = id;
            return this;
        }

        O paid(Instant at, long minor) {
            paid = true;
            paidAt = at;
            received = minor;
            return this;
        }

        O refund(Instant at, long minor) {
            returnedAt = at;
            refunded = minor;
            return this;
        }

        O claimed() {
            claimed = true;
            return this;
        }

        O discount(long subtotalMinor, long discountMinor) {
            subtotal = subtotalMinor;
            discount = discountMinor;
            total = subtotalMinor - discountMinor;
            return this;
        }

        O promo(String code) {
            promo = code;
            return this;
        }

        O times(Instant approvedAt, Instant shippedAt, Instant deliveredAt) {
            approved = approvedAt;
            shipped = shippedAt;
            delivered = deliveredAt;
            return this;
        }

        O reason(String text, String code) {
            reason = text;
            reasonCode = code;
            return this;
        }

        O payment(String title) {
            payment = title;
            return this;
        }

        OrderFact build() {
            return new OrderFact(id, status, source, total, subtotal, discount, received, refunded, created,
                    approved, shipped, delivered, rejectedAt, paidAt, returnedAt, paid, claimed, tg, "Покупатель " + tg,
                    "user" + tg, delivery, payment, promo, reason, reasonCode);
        }
    }

    static O order(Instant created) {
        return new O(created);
    }

    static ItemFact item(OrderFact o, String productId, long price, int qty) {
        return new ItemFact(o.id(), productId, null, "snap " + productId, null, price, qty, false);
    }

    static ItemFact variantItem(OrderFact o, String productId, String variantId, long price, int qty) {
        return new ItemFact(o.id(), productId, variantId, "snap " + productId, "v", price, qty, false);
    }

    static ItemFact gift(OrderFact o, String productId, int qty) {
        return new ItemFact(o.id(), productId, null, "gift " + productId, null, 0, qty, true);
    }

    static ProductFact product(String id, long price, int stock, Instant created, String... tags) {
        return new ProductFact(id, "Товар " + id, price, stock, true, false, created, List.of(tags), List.of());
    }

    static ProductFact hidden(String id, long price, int stock, boolean archived) {
        return new ProductFact(id, "Товар " + id, price, stock, archived, archived, Instant.parse("2026-01-01T00:00:00Z"),
                List.of(), List.of());
    }

    static ProductFact withVariants(String id, long price, Instant created, VariantFact... variants) {
        int stock = 0;
        for (VariantFact v : variants) {
            stock += v.stock();
        }
        return new ProductFact(id, "Товар " + id, price, stock, true, false, created, List.of(), List.of(variants));
    }

    static MetricsFacts facts(Instant now, List<OrderFact> orders, List<ItemFact> items, List<ProductFact> products) {
        return new MetricsFacts(new ArrayList<>(orders), new ArrayList<>(items), new ArrayList<>(products), List.of(), now);
    }
}
