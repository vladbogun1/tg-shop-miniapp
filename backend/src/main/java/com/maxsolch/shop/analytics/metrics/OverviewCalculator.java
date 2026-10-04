package com.maxsolch.shop.analytics.metrics;

import com.maxsolch.shop.analytics.metrics.MetricsDtos.CategoryRow;
import com.maxsolch.shop.analytics.metrics.MetricsDtos.ChannelRow;
import com.maxsolch.shop.analytics.metrics.MetricsDtos.Giveaways;
import com.maxsolch.shop.analytics.metrics.MetricsDtos.Kpi;
import com.maxsolch.shop.analytics.metrics.MetricsDtos.Kpis;
import com.maxsolch.shop.analytics.metrics.MetricsDtos.MoneyNow;
import com.maxsolch.shop.analytics.metrics.MetricsDtos.Overview;
import com.maxsolch.shop.analytics.metrics.MetricsDtos.SeriesPoint;
import com.maxsolch.shop.analytics.metrics.MetricsFacts.ItemFact;
import com.maxsolch.shop.analytics.metrics.MetricsFacts.OrderFact;
import com.maxsolch.shop.analytics.metrics.MetricsFacts.ProductFact;
import com.maxsolch.shop.domain.OrderStatus;

import java.time.Instant;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** The "Обзор" tab: money KPIs with comparison, series, categories, channels, heatmap, giveaways. */
public final class OverviewCalculator {

    static final String NO_CATEGORY = "Без категории";

    private final ZoneId zone;

    public OverviewCalculator(ZoneId zone) {
        this.zone = zone;
    }

    /** Sum of money and counts over one period. */
    record Totals(long sold, long received, long orders, long rejected, long created) {
        long aov() {
            return orders == 0 ? 0 : sold / orders;
        }

        double rejectRate() {
            return created == 0 ? 0 : Stats.round1(rejected * 100.0 / created);
        }
    }

    static Totals totals(List<OrderFact> orders, ChannelFilter channel, Instant from, Instant to) {
        long sold = 0;
        long received = 0;
        long count = 0;
        long rejected = 0;
        long created = 0;
        for (OrderFact o : orders) {
            if (!channel.matches(o.source())) {
                continue;
            }
            if (in(o.createdAt(), from, to)) {
                created++;
                if (o.rejected()) {
                    rejected++;
                } else {
                    sold += o.totalMinor();
                    count++;
                }
            }
            if (in(o.paidAt(), from, to)) {
                received += o.receivedMinor();
            }
            if (o.refundedMinor() > 0 && in(refundedAt(o), from, to)) {
                received -= o.refundedMinor();
            }
        }
        return new Totals(sold, received, count, rejected, created);
    }

    /** When a refund happened: the return date, else the rejection, else the payment. */
    static Instant refundedAt(OrderFact o) {
        if (o.returnedAt() != null) {
            return o.returnedAt();
        }
        return o.rejectedAt() != null ? o.rejectedAt() : o.paidAt();
    }

    static boolean in(Instant t, Instant from, Instant to) {
        return t != null && !t.isBefore(from) && t.isBefore(to);
    }

    public Overview compute(MetricsFacts facts, MetricsPeriod period, ChannelFilter channel,
                            Map<String, Long> visitorsByChannel) {
        List<OrderFact> orders = facts.orders();
        Totals cur = totals(orders, channel, period.from(), period.to());
        Totals prev = totals(orders, channel, period.prevFrom(), period.prevTo());
        boolean prevData = prev.created() > 0 || prev.received() != 0;

        Kpis kpis = new Kpis(
                Kpi.of(cur.sold(), prev.sold(), prevData),
                Kpi.of(cur.received(), prev.received(), prevData),
                Kpi.of(cur.orders(), prev.orders(), prevData),
                Kpi.of(cur.aov(), prev.aov(), prev.orders() > 0),
                Kpi.of(cur.rejectRate(), prev.rejectRate(), prev.created() > 0));

        long codInTransit = 0;
        long codOrders = 0;
        long awaiting = 0;
        long refunded = 0;
        for (OrderFact o : orders) {
            if (!channel.matches(o.source())) {
                continue;
            }
            if (o.status() == OrderStatus.SHIPPED && o.totalMinor() > o.receivedMinor()) {
                codInTransit += o.totalMinor() - o.receivedMinor();
                codOrders++;
            }
            if (awaitingConfirmation(o)) {
                awaiting++;
            }
            if (o.refundedMinor() > 0 && period.contains(refundedAt(o))) {
                refunded += o.refundedMinor();
            }
        }

        return new Overview(
                MetricsDtos.PeriodInfo.of(period, channel),
                kpis,
                new MoneyNow(codInTransit, codOrders, awaiting, refunded),
                series(orders, channel, period.from(), period.to(), period.granularity()),
                series(orders, channel, period.prevFrom(), period.prevTo(), period.granularity()),
                categories(facts, period, channel),
                channels(orders, period, visitorsByChannel),
                heatmap(orders, period, channel),
                giveaways(facts, period, channel));
    }

    /** "I paid" pressed by the customer, not yet confirmed by the admin, order still alive. */
    static boolean awaitingConfirmation(OrderFact o) {
        return o.paymentClaimed() && !o.paid() && !o.rejected();
    }

    List<SeriesPoint> series(List<OrderFact> orders, ChannelFilter channel, Instant from, Instant to,
                             MetricsPeriod.Granularity g) {
        Map<String, long[]> acc = new LinkedHashMap<>();
        for (String k : Buckets.keys(from, to, g, zone)) {
            acc.put(k, new long[4]);
        }
        for (OrderFact o : orders) {
            if (!channel.matches(o.source())) {
                continue;
            }
            if (in(o.createdAt(), from, to)) {
                long[] a = acc.computeIfAbsent(Buckets.key(o.createdAt(), g, zone), k -> new long[4]);
                if (o.rejected()) {
                    a[3]++;
                } else {
                    a[0]++;
                    a[1] += o.totalMinor();
                }
            }
            if (in(o.paidAt(), from, to)) {
                acc.computeIfAbsent(Buckets.key(o.paidAt(), g, zone), k -> new long[4])[2] += o.receivedMinor();
            }
            Instant refundAt = refundedAt(o);
            if (o.refundedMinor() > 0 && in(refundAt, from, to)) {
                acc.computeIfAbsent(Buckets.key(refundAt, g, zone), k -> new long[4])[2] -= o.refundedMinor();
            }
        }
        List<SeriesPoint> out = new ArrayList<>(acc.size());
        acc.forEach((k, a) -> out.add(new SeriesPoint(k, a[0], a[1], a[2], a[3])));
        return out;
    }

    /** Sales by category (tag). A product in two categories counts in both, so shares can exceed 100%. */
    List<CategoryRow> categories(MetricsFacts facts, MetricsPeriod period, ChannelFilter channel) {
        Map<String, OrderFact> byId = facts.orderById();
        Map<String, ProductFact> products = facts.productById();
        Map<String, long[]> acc = new HashMap<>(); // units, revenue
        long totalRevenue = 0;
        for (ItemFact it : facts.items()) {
            OrderFact o = byId.get(it.orderId());
            if (o == null || o.rejected() || it.gift() || !channel.matches(o.source())
                    || !period.contains(o.createdAt())) {
                continue;
            }
            long revenue = Math.round(it.priceMinor() * it.quantity() * o.chargedShare());
            totalRevenue += revenue;
            ProductFact p = products.get(it.productId());
            List<String> tags = p == null || p.tags().isEmpty() ? List.of(NO_CATEGORY) : p.tags();
            for (String tag : tags) {
                long[] a = acc.computeIfAbsent(tag, k -> new long[2]);
                a[0] += it.quantity();
                a[1] += revenue;
            }
        }
        Map<String, Long> live = new HashMap<>();
        for (ProductFact p : facts.products()) {
            if (!p.live()) {
                continue;
            }
            for (String tag : p.tags().isEmpty() ? List.of(NO_CATEGORY) : p.tags()) {
                live.merge(tag, 1L, Long::sum);
            }
        }
        Set<String> names = new HashSet<>(acc.keySet());
        names.addAll(live.keySet());
        final long total = totalRevenue;
        List<CategoryRow> out = new ArrayList<>();
        for (String name : names) {
            long[] a = acc.getOrDefault(name, new long[2]);
            long liveCount = live.getOrDefault(name, 0L);
            out.add(new CategoryRow(name, a[0], a[1],
                    total == 0 ? 0 : Stats.round1(a[1] * 100.0 / total),
                    liveCount,
                    liveCount == 0 ? 0 : Stats.round2((double) a[0] / liveCount)));
        }
        out.sort(Comparator.comparingLong(CategoryRow::revenueMinor).reversed()
                .thenComparing(CategoryRow::name));
        return out;
    }

    /** Mini App vs website (and admin-entered orders when there are any), regardless of the filter. */
    List<ChannelRow> channels(List<OrderFact> orders, MetricsPeriod period, Map<String, Long> visitors) {
        List<ChannelRow> out = new ArrayList<>();
        for (String source : List.of("MINIAPP", "WEB", "ADMIN")) {
            long count = 0;
            long sold = 0;
            long created = 0;
            long rejected = 0;
            Set<Long> buyers = new HashSet<>();
            for (OrderFact o : orders) {
                if (!source.equals(o.source()) || !period.contains(o.createdAt())) {
                    continue;
                }
                created++;
                if (o.rejected()) {
                    rejected++;
                    continue;
                }
                count++;
                sold += o.totalMinor();
                if (o.tgUserId() != null) {
                    buyers.add(o.tgUserId());
                }
            }
            if ("ADMIN".equals(source) && created == 0) {
                continue;
            }
            Long v = visitors == null ? null : visitors.get(source);
            Double conversion = v == null || v == 0 ? null : Stats.round1(buyers.size() * 100.0 / v);
            out.add(new ChannelRow(source, count, sold, count == 0 ? 0 : sold / count,
                    created == 0 ? 0 : Stats.round1(rejected * 100.0 / created), v, buyers.size(), conversion));
        }
        return out;
    }

    /** Orders placed (all, including later rejected) by weekday (Mon=0) × local hour. */
    long[][] heatmap(List<OrderFact> orders, MetricsPeriod period, ChannelFilter channel) {
        long[][] grid = new long[7][24];
        for (OrderFact o : orders) {
            if (channel.matches(o.source()) && period.contains(o.createdAt())) {
                ZonedDateTime z = o.createdAt().atZone(zone);
                grid[z.getDayOfWeek().getValue() - 1][z.getHour()]++;
            }
        }
        return grid;
    }

    Giveaways giveaways(MetricsFacts facts, MetricsPeriod period, ChannelFilter channel) {
        long discount = 0;
        long promoOrders = 0;
        Map<String, OrderFact> byId = facts.orderById();
        for (OrderFact o : facts.orders()) {
            if (o.rejected() || !channel.matches(o.source()) || !period.contains(o.createdAt())) {
                continue;
            }
            discount += o.discountMinor();
            if (o.discountMinor() > 0) {
                promoOrders++;
            }
        }
        Map<String, ProductFact> products = facts.productById();
        long giftUnits = 0;
        long giftValue = 0;
        for (ItemFact it : facts.items()) {
            if (!it.gift()) {
                continue;
            }
            OrderFact o = byId.get(it.orderId());
            if (o == null || o.rejected() || !channel.matches(o.source()) || !period.contains(o.createdAt())) {
                continue;
            }
            giftUnits += it.quantity();
            ProductFact p = products.get(it.productId());
            long price = it.priceMinor() > 0 ? it.priceMinor() : p == null ? 0 : p.priceMinor();
            giftValue += price * it.quantity();
        }
        return new Giveaways(discount, promoOrders, giftUnits, giftValue);
    }
}
