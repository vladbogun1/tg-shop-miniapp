package com.maxsolch.shop.analytics.metrics;

import com.maxsolch.shop.analytics.metrics.MetricsDtos.DemandRow;
import com.maxsolch.shop.analytics.metrics.MetricsDtos.Reorder;
import com.maxsolch.shop.analytics.metrics.MetricsDtos.ReorderRow;
import com.maxsolch.shop.analytics.metrics.MetricsFacts.ItemFact;
import com.maxsolch.shop.analytics.metrics.MetricsFacts.OrderFact;
import com.maxsolch.shop.analytics.metrics.MetricsFacts.ProductFact;
import com.maxsolch.shop.analytics.metrics.MetricsFacts.VariantFact;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * "Что дозаказать": how fast each product (or variant) sells, when it runs out, and how many to bring
 * in to cover the next N days — plus demand for things that cannot be bought right now.
 *
 * <p>Velocity is recency-weighted so a product that just took off is not averaged away by a quiet
 * quarter: 50% weight on the last 14 days, 30% on days 15–30, 20% on days 31–90 (each window as units
 * per day). A window the product did not exist for yet is dropped and the weights renormalised.
 * There is no stock history, so days spent out of stock are counted as "no demand": velocity of a
 * product that was sold out for a while is underestimated — the interest signal (views / adds to cart)
 * is shown next to it for that reason.
 */
public final class ReorderCalculator {

    /** "Running out" threshold in days of stock left. // TODO settings: metrics.lowStockDays */
    public static final int LOW_STOCK_DAYS = 14;

    static final String METHOD = "Скорость продаж: 50% — последние 14 дн., 30% — дни 15–30, 20% — дни 31–90 "
            + "(шт./день, без отказов и подарков). Дней до нуля = остаток / скорость. "
            + "Рекомендуется = скорость × горизонт − остаток. В списке — то, что продалось хотя бы 2 раза за 90 дней. Дни без товара на складе считаются днями "
            + "без спроса, поэтому для товаров, которых долго не было, смотрите на просмотры и корзины.";

    /** At least this many units sold in 90 days before a product counts as "selling". */
    static final int MIN_SALES = 2;
    /** A window must have covered at least this many days of the product's life to count. */
    static final int MIN_WINDOW_DAYS = 7;
    private static final int MAX_ROWS = 60;
    private static final int MAX_DEMAND = 30;

    /** Interest from the event journal over the last 30 days. */
    public record Interest(long views, long viewers, long cartAdds) {
        static final Interest NONE = new Interest(0, 0, 0);
    }

    /** Units sold per window (0–14, 15–30, 31–90 days ago) for one product or variant. */
    static final class Sales {
        int d14;
        int d30;
        int d90;
        Instant last;

        void add(int qty, double ageDays, Instant at) {
            if (ageDays < 14) {
                d14 += qty;
            } else if (ageDays < 30) {
                d30 += qty;
            } else if (ageDays < 90) {
                d90 += qty;
            }
            if (last == null || at.isAfter(last)) {
                last = at;
            }
        }

        int sold30() {
            return d14 + d30;
        }

        int sold90() {
            return d14 + d30 + d90;
        }
    }

    public Reorder compute(MetricsFacts facts, Map<String, Interest> interest, int coverDays) {
        Instant now = facts.now();
        Map<String, OrderFact> orders = facts.orderById();
        Map<String, Sales> byProduct = new HashMap<>();
        Map<String, Sales> byVariant = new HashMap<>();
        for (ItemFact it : facts.items()) {
            OrderFact o = orders.get(it.orderId());
            if (o == null || o.rejected() || it.gift() || o.createdAt() == null) {
                continue;
            }
            double age = Duration.between(o.createdAt(), now).toMinutes() / 1440.0;
            byProduct.computeIfAbsent(it.productId(), k -> new Sales()).add(it.quantity(), age, o.createdAt());
            if (it.variantId() != null) {
                byVariant.computeIfAbsent(it.variantId(), k -> new Sales()).add(it.quantity(), age, o.createdAt());
            }
        }

        List<ReorderRow> rows = new ArrayList<>();
        List<DemandRow> demand = new ArrayList<>();
        for (ProductFact p : facts.products()) {
            Interest in = interest.getOrDefault(p.id(), Interest.NONE);
            Sales ps = byProduct.getOrDefault(p.id(), new Sales());
            double ageDays = p.createdAt() == null ? 365 : Duration.between(p.createdAt(), now).toMinutes() / 1440.0;

            if (p.live()) {
                if (p.variants().isEmpty()) {
                    addRow(rows, p, null, p.stock(), ps, ageDays, in, coverDays);
                } else {
                    for (VariantFact v : p.variants()) {
                        Sales vs = byVariant.getOrDefault(v.id(), new Sales());
                        addRow(rows, p, v, v.stock(), vs, ageDays, in, coverDays);
                    }
                }
            }
            boolean unavailable = !p.live() || p.stock() <= 0;
            if (unavailable && (in.views() > 0 || in.cartAdds() > 0 || ps.sold90() > 0)) {
                Long lastDays = ps.last == null ? null : Duration.between(ps.last, now).toDays();
                demand.add(new DemandRow(p.id(), p.title(), p.stock(), p.live(), in.views(), in.viewers(),
                        in.cartAdds(), ps.sold90(), lastDays));
            }
        }
        rows.sort(Comparator.comparing((ReorderRow r) -> r.daysToZero() == null ? Double.MAX_VALUE : r.daysToZero())
                .thenComparing(Comparator.comparingDouble(ReorderRow::velocityPerDay).reversed()));
        demand.sort(Comparator.comparingDouble(ReorderCalculator::demandScore).reversed());
        return new Reorder(coverDays,
                rows.size() > MAX_ROWS ? rows.subList(0, MAX_ROWS) : rows,
                demand.size() > MAX_DEMAND ? demand.subList(0, MAX_DEMAND) : demand,
                METHOD);
    }

    /** An add to cart says more than a glance; a recent sale proves the demand is real. */
    static double demandScore(DemandRow d) {
        return d.cartAdds30() * 3.0 + d.viewers30() + d.sold90() * 2.0;
    }

    private void addRow(List<ReorderRow> rows, ProductFact p, VariantFact v, int stock, Sales s, double ageDays,
                        Interest in, int coverDays) {
        double velocity = velocity(s, ageDays);
        if (velocity <= 0 || s.sold90() < MIN_SALES) {
            return; // a single sale in a quarter is luck, not a pace worth reordering for
        }
        double daysToZero = stock <= 0 ? 0 : stock / velocity;
        if (daysToZero > coverDays) {
            return; // enough for the whole horizon: not a reorder candidate
        }
        int recommend = (int) Math.max(0, Math.ceil(velocity * coverDays - stock));
        String urgency = daysToZero <= 7 ? "critical" : daysToZero <= LOW_STOCK_DAYS ? "soon" : "plan";
        rows.add(new ReorderRow(p.id(), v == null ? null : v.id(), p.title(), v == null ? null : v.name(), stock,
                s.sold30(), s.sold90(), Stats.round2(velocity), Stats.round1(daysToZero), recommend,
                in.views(), in.cartAdds(), p.live(), urgency));
    }

    /**
     * Recency-weighted units per day. Windows the product did not exist for (younger than the window
     * start) are dropped; a partially covered window is divided by the days it actually covered.
     */
    static double velocity(Sales s, double ageDays) {
        double[][] windows = {
                {0, 14, s.d14, 0.5},
                {14, 30, s.d30, 0.3},
                {30, 90, s.d90, 0.2},
        };
        double weighted = 0;
        double weights = 0;
        for (double[] w : windows) {
            double covered = Math.min(w[1], ageDays) - w[0];
            if (covered < MIN_WINDOW_DAYS) {
                continue; // too few days of existence in this window: a couple of sales would look like a rush
            }
            weighted += w[3] * (w[2] / covered);
            weights += w[3];
        }
        return weights == 0 ? 0 : weighted / weights;
    }
}
