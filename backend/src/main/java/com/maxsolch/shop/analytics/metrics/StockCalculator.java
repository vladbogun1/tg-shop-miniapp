package com.maxsolch.shop.analytics.metrics;

import com.maxsolch.shop.analytics.metrics.MetricsDtos.CategoryStock;
import com.maxsolch.shop.analytics.metrics.MetricsDtos.DeadStockBucket;
import com.maxsolch.shop.analytics.metrics.MetricsDtos.DeadStockRow;
import com.maxsolch.shop.analytics.metrics.MetricsDtos.ForgottenRow;
import com.maxsolch.shop.analytics.metrics.MetricsDtos.Reorder;
import com.maxsolch.shop.analytics.metrics.MetricsDtos.Stock;
import com.maxsolch.shop.analytics.metrics.MetricsDtos.StockKpis;
import com.maxsolch.shop.analytics.metrics.MetricsDtos.TopProduct;
import com.maxsolch.shop.analytics.metrics.MetricsFacts.ItemFact;
import com.maxsolch.shop.analytics.metrics.MetricsFacts.OrderFact;
import com.maxsolch.shop.analytics.metrics.MetricsFacts.ProductFact;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * The "Товары и склад" tab. All stock values are at the current retail price — the shop records no
 * purchase prices, so "frozen money" is what the goods would fetch, not what they cost.
 */
public final class StockCalculator {

    /** Dead-stock thresholds offered by the page. // TODO settings: metrics.deadStockDays (60) */
    public static final List<Integer> DEAD_DAYS = List.of(30, 60, 90);
    public static final int DEFAULT_DEAD_DAYS = 60;
    private static final int TOP_LIMIT = 50;
    private static final int DEAD_LIMIT = 200;

    public Stock compute(MetricsFacts facts, MetricsPeriod period, ChannelFilter channel, int deadDays,
                         Map<String, ReorderCalculator.Interest> interest30, Reorder reorder) {
        Instant now = facts.now();
        Map<String, OrderFact> orders = facts.orderById();

        // Last sale and 30-day sold value per product (all channels: stock is shared).
        Map<String, Instant> lastSale = new HashMap<>();
        Map<String, Long> sold30Value = new HashMap<>();
        Instant cut30 = now.minus(Duration.ofDays(30));
        for (ItemFact it : facts.items()) {
            OrderFact o = orders.get(it.orderId());
            if (o == null || !o.sold() || it.gift() || o.createdAt() == null) {
                continue;
            }
            lastSale.merge(it.productId(), o.createdAt(), (a, b) -> a.isAfter(b) ? a : b);
            if (!o.createdAt().isBefore(cut30)) {
                sold30Value.merge(it.productId(), Math.round(it.priceMinor() * it.quantity() * o.chargedShare()),
                        Long::sum);
            }
        }

        long stockValue = 0;
        long stockUnits = 0;
        long live = 0;
        long forgottenValue = 0;
        List<ForgottenRow> forgotten = new ArrayList<>();
        Map<Integer, long[]> buckets = new LinkedHashMap<>();
        DEAD_DAYS.forEach(d -> buckets.put(d, new long[3]));
        List<DeadStockRow> dead = new ArrayList<>();
        Map<String, long[]> catAcc = new HashMap<>(); // products, units, value, sold30
        long totalSold30 = 0;
        for (long v : sold30Value.values()) {
            totalSold30 += v;
        }

        for (ProductFact p : facts.products()) {
            long value = (long) Math.max(0, p.stock()) * p.priceMinor();
            if (!p.live()) {
                if (p.stock() > 0) {
                    forgotten.add(new ForgottenRow(p.id(), p.title(), p.stock(), value, p.archived()));
                    forgottenValue += value;
                }
                continue;
            }
            live++;
            stockValue += value;
            stockUnits += Math.max(0, p.stock());
            for (String tag : p.tags().isEmpty() ? List.of(OverviewCalculator.NO_CATEGORY) : p.tags()) {
                long[] a = catAcc.computeIfAbsent(tag, k -> new long[4]);
                a[0]++;
                a[1] += Math.max(0, p.stock());
                a[2] += value;
                a[3] += sold30Value.getOrDefault(p.id(), 0L);
            }
            if (p.stock() <= 0) {
                continue;
            }
            Instant last = lastSale.get(p.id());
            Instant since = last != null ? last : p.createdAt();
            int idle = since == null ? 9999 : (int) Duration.between(since, now).toDays();
            for (int d : DEAD_DAYS) {
                if (idle >= d) {
                    long[] b = buckets.get(d);
                    b[0]++;
                    b[1] += p.stock();
                    b[2] += value;
                }
            }
            if (idle >= deadDays) {
                ReorderCalculator.Interest in = interest30 == null ? null : interest30.get(p.id());
                dead.add(new DeadStockRow(p.id(), p.title(), p.tags(), p.stock(), p.priceMinor(), value, idle,
                        last == null,
                        interest30 == null ? null : in == null ? 0L : in.views(),
                        interest30 == null ? null : in == null ? 0L : in.cartAdds()));
            }
        }
        dead.sort(Comparator.comparingLong(DeadStockRow::valueMinor).reversed());
        forgotten.sort(Comparator.comparingLong(ForgottenRow::valueMinor).reversed());

        List<DeadStockBucket> deadBuckets = new ArrayList<>();
        buckets.forEach((d, b) -> deadBuckets.add(new DeadStockBucket(d, b[0], b[1], b[2])));
        long[] deadSel = buckets.getOrDefault(deadDays, new long[3]);
        if (!buckets.containsKey(deadDays)) {
            deadSel = new long[]{dead.size(), 0, dead.stream().mapToLong(DeadStockRow::valueMinor).sum()};
        }

        List<CategoryStock> categories = new ArrayList<>();
        catAcc.forEach((name, a) -> categories.add(new CategoryStock(name, a[0], a[1], a[2], cover(a[2], a[3]))));
        categories.sort(Comparator.comparingLong(CategoryStock::valueMinor).reversed());

        long runningOut = reorder.rows().stream()
                .filter(r -> r.daysToZero() != null && r.daysToZero() <= ReorderCalculator.LOW_STOCK_DAYS)
                .count();

        StockKpis kpis = new StockKpis(stockValue, stockUnits, live, cover(stockValue, totalSold30),
                deadSel[2], deadSel[0], runningOut, forgottenValue, forgotten.size());

        return new Stock(MetricsDtos.PeriodInfo.of(period, channel), kpis,
                topProducts(facts, period, channel),
                dead.size() > DEAD_LIMIT ? dead.subList(0, DEAD_LIMIT) : dead,
                deadBuckets, forgotten, categories, reorder);
    }

    /** Days the stock lasts at the last 30 days' sales pace (both at retail); null when nothing sold. */
    static Double cover(long stockValue, long sold30Value) {
        if (sold30Value <= 0) {
            return null;
        }
        return Stats.round1(stockValue / (sold30Value / 30.0));
    }

    /** Best sellers by product id (current title), excluding rejected orders and gifts. */
    List<TopProduct> topProducts(MetricsFacts facts, MetricsPeriod period, ChannelFilter channel) {
        Map<String, OrderFact> orders = facts.orderById();
        Map<String, ProductFact> products = facts.productById();
        Map<String, long[]> acc = new HashMap<>(); // units, revenue
        Map<String, Set<String>> orderSets = new HashMap<>();
        Map<String, String> snapshotTitle = new HashMap<>();
        for (ItemFact it : facts.items()) {
            OrderFact o = orders.get(it.orderId());
            if (o == null || !o.sold() || it.gift() || !channel.matches(o.source())
                    || !period.contains(o.createdAt())) {
                continue;
            }
            long[] a = acc.computeIfAbsent(it.productId(), k -> new long[2]);
            a[0] += it.quantity();
            a[1] += Math.round(it.priceMinor() * it.quantity() * o.chargedShare());
            orderSets.computeIfAbsent(it.productId(), k -> new HashSet<>()).add(it.orderId());
            snapshotTitle.putIfAbsent(it.productId(), it.title());
        }
        List<TopProduct> out = new ArrayList<>();
        acc.forEach((id, a) -> {
            ProductFact p = products.get(id);
            out.add(new TopProduct(id, p != null ? p.title() : snapshotTitle.getOrDefault(id, "—"), a[0], a[1],
                    orderSets.get(id).size(), p != null && p.live(), p == null ? 0 : p.stock()));
        });
        out.sort(Comparator.comparingLong(TopProduct::revenueMinor).reversed()
                .thenComparing(Comparator.comparingLong(TopProduct::units).reversed()));
        return out.size() > TOP_LIMIT ? out.subList(0, TOP_LIMIT) : out;
    }
}
