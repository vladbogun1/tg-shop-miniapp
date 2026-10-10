package com.maxsolch.shop.analytics.metrics;

import com.maxsolch.shop.analytics.metrics.MetricsDtos.CategoryRow;
import com.maxsolch.shop.analytics.metrics.MetricsDtos.ChannelRow;
import com.maxsolch.shop.analytics.metrics.MetricsDtos.Giveaways;
import com.maxsolch.shop.analytics.metrics.MetricsDtos.Kpi;
import com.maxsolch.shop.analytics.metrics.MetricsDtos.Kpis;
import com.maxsolch.shop.analytics.metrics.MetricsDtos.MoneyNow;
import com.maxsolch.shop.analytics.metrics.MetricsDtos.OnlinePayments;
import com.maxsolch.shop.analytics.metrics.MetricsDtos.Overview;
import com.maxsolch.shop.analytics.metrics.MetricsDtos.SchemeRow;
import com.maxsolch.shop.analytics.metrics.MetricsDtos.SeriesPoint;
import com.maxsolch.shop.analytics.metrics.MetricsFacts.InvoiceFact;
import com.maxsolch.shop.analytics.metrics.MetricsFacts.ItemFact;
import com.maxsolch.shop.analytics.metrics.MetricsFacts.OrderFact;
import com.maxsolch.shop.analytics.metrics.MetricsFacts.PaymentScheme;
import com.maxsolch.shop.analytics.metrics.MetricsFacts.ProductFact;
import com.maxsolch.shop.domain.OrderStatus;

import java.time.Instant;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.EnumMap;
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

    /**
     * Sum of money and counts over one period.
     *
     * @param created  orders placed that are decided: without online orders still waiting for
     *                 payment and without automatic cancellations for non-payment
     * @param awaiting online orders placed in the period and still unpaid (not a sale yet)
     * @param timedOut online orders placed in the period and cancelled for non-payment (PAYMENT_TIMEOUT)
     */
    record Totals(long sold, long received, long orders, long rejected, long created, long awaiting,
                  long timedOut) {
        long aov() {
            return orders == 0 ? 0 : sold / orders;
        }

        /**
         * Rejections by the shop or the customer among decided orders. An unpaid online checkout that
         * expired is an abandoned payment, not a rejection — it is shown in the online-payment block.
         */
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
        long awaiting = 0;
        long timedOut = 0;
        for (OrderFact o : orders) {
            if (!channel.matches(o.source())) {
                continue;
            }
            if (in(o.createdAt(), from, to)) {
                if (o.awaitingPayment()) {
                    awaiting++;
                } else if (o.paymentTimedOut()) {
                    timedOut++;
                } else {
                    created++;
                    if (o.rejected()) {
                        rejected++;
                    } else {
                        sold += o.soldMinor();
                        count++;
                    }
                }
            }
            received += receivedIn(o, from, to);
        }
        return new Totals(sold, received, count, rejected, created, awaiting, timedOut);
    }

    /**
     * Money of one order that arrived in [from, to): the online / prepaid part by its payment date,
     * the cash-on-delivery rest by the delivery date, minus refunds by their date.
     */
    static long receivedIn(OrderFact o, Instant from, Instant to) {
        long[] parts = o.receivedParts();
        long sum = 0;
        if (parts[0] != 0 && in(o.upfrontAt(), from, to)) {
            sum += parts[0];
        }
        if (parts[1] != 0 && in(o.deliveredAt(), from, to)) {
            sum += parts[1];
        }
        if (o.refundedMinor() > 0 && in(o.refundedAt(), from, to)) {
            sum -= o.refundedMinor();
        }
        return sum;
    }

    /** When a refund happened: the return date, the monobank refund, the rejection, the payment. */
    static Instant refundedAt(OrderFact o) {
        return o.refundedAt();
    }

    static boolean in(Instant t, Instant from, Instant to) {
        return t != null && !t.isBefore(from) && t.isBefore(to);
    }

    public Overview compute(MetricsFacts facts, MetricsPeriod period, ChannelFilter channel,
                            Map<String, Long> visitorsByChannel) {
        List<OrderFact> orders = facts.orders();
        Totals cur = totals(orders, channel, period.from(), period.to());
        Totals prev = totals(orders, channel, period.prevFrom(), period.prevTo());
        boolean prevData = prev.created() > 0 || prev.received() != 0 || prev.awaiting() > 0;

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
        long unpaid = 0;
        long unpaidMinor = 0;
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
            if (o.awaitingPayment()) {
                unpaid++;
                unpaidMinor += o.totalMinor();
            }
            if (o.refundedMinor() > 0 && period.contains(o.refundedAt())) {
                refunded += o.refundedMinor();
            }
        }

        return new Overview(
                MetricsDtos.PeriodInfo.of(period, channel),
                kpis,
                new MoneyNow(codInTransit, codOrders, awaiting, refunded, unpaid, unpaidMinor),
                series(orders, channel, period.from(), period.to(), period.granularity()),
                series(orders, channel, period.prevFrom(), period.prevTo(), period.granularity()),
                categories(facts, period, channel),
                channels(orders, period, visitorsByChannel),
                heatmap(orders, period, channel),
                giveaways(facts, period, channel),
                schemes(orders, period, channel),
                onlinePayments(facts, period, channel));
    }

    /**
     * Old manual transfers vs monobank side by side: orders by creation date (sold / rejected /
     * abandoned / still waiting) and money by the date it arrived.
     */
    static List<SchemeRow> schemes(List<OrderFact> orders, MetricsPeriod period, ChannelFilter channel) {
        Map<PaymentScheme, long[]> acc = new EnumMap<>(PaymentScheme.class);
        // sold orders, sold, received, rejected, timed out, awaiting payment
        for (OrderFact o : orders) {
            if (!channel.matches(o.source())) {
                continue;
            }
            long received = receivedIn(o, period.from(), period.to());
            boolean placed = period.contains(o.createdAt());
            if (!placed && received == 0) {
                continue;
            }
            long[] a = acc.computeIfAbsent(o.scheme(), k -> new long[6]);
            a[2] += received;
            if (!placed) {
                continue;
            }
            if (o.awaitingPayment()) {
                a[5]++;
            } else if (o.paymentTimedOut()) {
                a[4]++;
            } else if (o.rejected()) {
                a[3]++;
            } else {
                a[0]++;
                a[1] += o.soldMinor();
            }
        }
        List<SchemeRow> out = new ArrayList<>();
        acc.forEach((scheme, a) -> out.add(new SchemeRow(scheme.name(), scheme.label, scheme.online(),
                a[0], a[1], a[0] == 0 ? 0 : a[1] / a[0], a[2], a[3], a[4], a[5])));
        return out;
    }

    /**
     * monobank payments in the period: orders placed with online payment and how many got paid,
     * invoices issued and how they ended, money credited, refunded and the bank's fee.
     */
    static OnlinePayments onlinePayments(MetricsFacts facts, MetricsPeriod period, ChannelFilter channel) {
        Map<String, OrderFact> byId = facts.orderById();
        long placed = 0;
        long paidOrders = 0;
        long awaiting = 0;
        long timedOut = 0;
        long full = 0;
        long prepay = 0;
        Instant since = null;
        for (OrderFact o : facts.orders()) {
            if (!o.online() || !channel.matches(o.source())) {
                continue;
            }
            if (since == null || o.createdAt() != null && o.createdAt().isBefore(since)) {
                since = o.createdAt();
            }
            if (!period.contains(o.createdAt())) {
                continue;
            }
            placed++;
            if (o.scheme() == PaymentScheme.ONLINE_PREPAY) {
                prepay++;
            } else {
                full++;
            }
            if (o.onlinePaidMinor() > 0 || o.paid() || o.receivedMinor() > 0) {
                paidOrders++;
            } else if (o.awaitingPayment()) {
                awaiting++;
            } else if (o.paymentTimedOut()) {
                timedOut++;
            }
        }
        long invoices = 0;
        long credited = 0;
        long failed = 0;
        long creditedMinor = 0;
        long refundedMinor = 0;
        long feeMinor = 0;
        for (InvoiceFact inv : facts.invoices()) {
            OrderFact o = byId.get(inv.orderId());
            if (o != null && !channel.matches(o.source())) {
                continue;
            }
            if (period.contains(inv.createdAt())) {
                invoices++;
                if (inv.failedOrExpired()) {
                    failed++;
                }
            }
            if (inv.credited() && period.contains(inv.appliedAt())) {
                credited++;
                creditedMinor += inv.amountMinor();
                feeMinor += inv.feeMinor();
            }
            if (inv.refundedMinor() > 0 && period.contains(inv.updatedAt())) {
                refundedMinor += inv.refundedMinor();
            }
        }
        long decided = placed - awaiting;
        Double conversion = decided == 0 ? null : Stats.round1(paidOrders * 100.0 / decided);
        return new OnlinePayments(since, placed, full, prepay, paidOrders, awaiting, timedOut, conversion,
                invoices, credited, failed, creditedMinor, refundedMinor, feeMinor);
    }

    /**
     * Money is in (an online payment) but the order is still NEW: payment does not move the
     * status, an admin has to confirm the order.
     */
    static boolean awaitingConfirmation(OrderFact o) {
        return o.status() == OrderStatus.NEW && o.paid() && o.receivedMinor() > 0;
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
            if (in(o.createdAt(), from, to) && !o.awaitingPayment() && !o.paymentTimedOut()) {
                long[] a = acc.computeIfAbsent(Buckets.key(o.createdAt(), g, zone), k -> new long[4]);
                if (o.rejected()) {
                    a[3]++;
                } else {
                    a[0]++;
                    a[1] += o.soldMinor();
                }
            }
            long[] parts = o.receivedParts();
            if (parts[0] != 0 && in(o.upfrontAt(), from, to)) {
                acc.computeIfAbsent(Buckets.key(o.upfrontAt(), g, zone), k -> new long[4])[2] += parts[0];
            }
            if (parts[1] != 0 && in(o.deliveredAt(), from, to)) {
                acc.computeIfAbsent(Buckets.key(o.deliveredAt(), g, zone), k -> new long[4])[2] += parts[1];
            }
            Instant refundAt = o.refundedAt();
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
        Map<ItemFact, Long> value = facts.soldValueByItem();
        long totalRevenue = 0;
        for (ItemFact it : facts.items()) {
            OrderFact o = byId.get(it.orderId());
            if (o == null || !o.sold() || it.gift() || !channel.matches(o.source())
                    || !period.contains(o.createdAt())) {
                continue;
            }
            long revenue = value.getOrDefault(it, 0L);
            totalRevenue += revenue;
            ProductFact p = products.get(it.productId());
            List<String> tags = p == null || p.tags().isEmpty() ? List.of(NO_CATEGORY) : p.tags();
            for (String tag : tags) {
                long[] a = acc.computeIfAbsent(tag, k -> new long[2]);
                a[0] += it.soldQuantity();
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
                if (!source.equals(o.source()) || !period.contains(o.createdAt())
                        || o.awaitingPayment() || o.paymentTimedOut()) {
                    continue;
                }
                created++;
                if (o.rejected()) {
                    rejected++;
                    continue;
                }
                count++;
                sold += o.soldMinor();
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
            if (!o.sold() || !channel.matches(o.source()) || !period.contains(o.createdAt())) {
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
            if (o == null || !o.sold() || !channel.matches(o.source()) || !period.contains(o.createdAt())) {
                continue;
            }
            giftUnits += it.soldQuantity();
            ProductFact p = products.get(it.productId());
            long price = it.priceMinor() > 0 ? it.priceMinor() : p == null ? 0 : p.priceMinor();
            giftValue += price * it.soldQuantity();
        }
        return new Giveaways(discount, promoOrders, giftUnits, giftValue);
    }
}
