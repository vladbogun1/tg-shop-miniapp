package com.maxsolch.shop.analytics.metrics;

import com.maxsolch.shop.analytics.EventClassifier;
import com.maxsolch.shop.analytics.metrics.MetricsDtos.Funnel;
import com.maxsolch.shop.analytics.metrics.MetricsDtos.FunnelStep;
import com.maxsolch.shop.analytics.metrics.MetricsDtos.InterestRow;
import com.maxsolch.shop.analytics.metrics.MetricsFacts.ItemFact;
import com.maxsolch.shop.analytics.metrics.MetricsFacts.OrderFact;
import com.maxsolch.shop.analytics.metrics.MetricsFacts.ProductFact;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * The "Воронка" tab. The first four steps are unique visitors from the event journal (rolled-up days
 * plus today), the last three are unique Telegram accounts from the orders themselves — so a lost
 * analytics batch can never make "ordered" look smaller than it is.
 */
public final class FunnelCalculator {

    /** A product needs this many (daily-unique) viewers before its conversion means anything. */
    static final int MIN_VIEWERS = 5;
    /** "Many look, few buy": fewer buyers than this share of viewers. */
    static final double LOW_CONVERSION_PCT = 5.0;
    private static final int LIMIT = 20;

    private final java.time.ZoneId zone;

    public FunnelCalculator(java.time.ZoneId zone) {
        this.zone = zone;
    }

    public Funnel compute(MetricsFacts facts, MetricsPeriod period, ChannelFilter channel,
                          List<EventClassifier.VisitorDay> visitorDays,
                          List<EventClassifier.ProductDay> productDays,
                          LocalDate dataSince) {
        String eventChannel = channel.eventChannel();
        List<EventClassifier.VisitorDay> rows = visitorDays.stream()
                .filter(v -> eventChannel == null || eventChannel.equals(v.channel()))
                .toList();
        Map<String, Integer> stages = EventClassifier.stagesByVisitor(rows);
        long visit = stages.size();
        long product = stages.values().stream().filter(s -> (s & EventClassifier.STAGE_PRODUCT) != 0).count();
        long cart = stages.values().stream().filter(s -> (s & EventClassifier.STAGE_CART) != 0).count();
        long checkout = stages.values().stream().filter(s -> (s & EventClassifier.STAGE_CHECKOUT) != 0).count();

        // When the journal starts inside the period, the order steps start there too: otherwise a month
        // with two weeks of events showed more "ordered" than "started checkout" (e.g. 103 vs 69).
        boolean partial = dataSince != null && Buckets.day(period.from(), zone).isBefore(dataSince);
        java.time.Instant ordersFrom = partial ? dataSince.atStartOfDay(zone).toInstant() : period.from();
        Set<Long> ordered = new HashSet<>();
        Set<Long> paid = new HashSet<>();
        Set<Long> shipped = new HashSet<>();
        for (OrderFact o : facts.orders()) {
            if (o.tgUserId() == null || !channel.matches(o.source())
                    || !OverviewCalculator.in(o.createdAt(), ordersFrom, period.to())) {
                continue;
            }
            ordered.add(o.tgUserId());
            if (o.paid() || o.receivedMinor() > 0) {
                paid.add(o.tgUserId());
            }
            if (o.shippedAt() != null) {
                shipped.add(o.tgUserId());
            }
        }

        long[] counts = {visit, product, cart, checkout, ordered.size(), paid.size(), shipped.size()};
        String[][] names = {
                {"visit", "Зашли"}, {"product", "Открыли товар"}, {"cart", "Добавили в корзину"},
                {"checkout", "Начали оформление"}, {"order", "Оформили заказ"}, {"paid", "Оплатили"},
                {"shipped", "Отправлено"}};
        List<FunnelStep> steps = new ArrayList<>();
        for (int i = 0; i < counts.length; i++) {
            Double fromStart = counts[0] == 0 ? null : Stats.round1(counts[i] * 100.0 / counts[0]);
            Double fromPrev = i == 0 ? null : counts[i - 1] == 0 ? null : Stats.round1(counts[i] * 100.0 / counts[i - 1]);
            steps.add(new FunnelStep(names[i][0], names[i][1], counts[i], fromStart, fromPrev));
        }

        String note = null;
        if (dataSince == null) {
            note = "Событий поведения ещё нет — первые четыре шага появятся, когда покупатели начнут заходить.";
        } else if (partial) {
            note = "Данные о поведении есть с " + dataSince + ": вся воронка, включая заказы, считается с этого дня, "
                    + "чтобы шаги можно было сравнивать между собой.";
        }
        return new Funnel(MetricsDtos.PeriodInfo.of(period, channel), dataSince == null ? null : dataSince.toString(),
                steps, lowConversion(facts, period, channel, productDays), note);
    }

    /** Products many people looked at but few bought. */
    List<InterestRow> lowConversion(MetricsFacts facts, MetricsPeriod period, ChannelFilter channel,
                                    List<EventClassifier.ProductDay> productDays) {
        String eventChannel = channel.eventChannel();
        Map<String, long[]> interest = new HashMap<>(); // views, viewers, cartAdds
        for (EventClassifier.ProductDay p : productDays) {
            if (eventChannel != null && !eventChannel.equals(p.channel())) {
                continue;
            }
            long[] a = interest.computeIfAbsent(p.productId(), k -> new long[3]);
            a[0] += p.views();
            a[1] += p.viewers();
            a[2] += p.cartAdds();
        }
        Map<String, OrderFact> orders = facts.orderById();
        Map<String, long[]> sold = new HashMap<>();
        Map<String, Set<Long>> buyers = new HashMap<>();
        for (ItemFact it : facts.items()) {
            OrderFact o = orders.get(it.orderId());
            if (o == null || !o.sold() || it.gift() || !channel.matches(o.source())
                    || !period.contains(o.createdAt())) {
                continue;
            }
            sold.computeIfAbsent(it.productId(), k -> new long[1])[0] += it.soldQuantity();
            if (o.tgUserId() != null) {
                buyers.computeIfAbsent(it.productId(), k -> new HashSet<>()).add(o.tgUserId());
            }
        }
        Map<String, ProductFact> products = facts.productById();
        List<InterestRow> out = new ArrayList<>();
        interest.forEach((id, a) -> {
            if (a[1] < MIN_VIEWERS) {
                return;
            }
            long b = buyers.getOrDefault(id, Set.of()).size();
            double conv = a[1] == 0 ? 0 : b * 100.0 / a[1];
            if (conv >= LOW_CONVERSION_PCT) {
                return;
            }
            ProductFact p = products.get(id);
            out.add(new InterestRow(id, p == null ? "—" : p.title(), a[0], a[1], a[2],
                    sold.getOrDefault(id, new long[1])[0], b, Stats.round1(conv),
                    p == null ? 0 : p.stock(), p != null && p.live()));
        });
        out.sort(Comparator.comparingLong(InterestRow::viewers).reversed());
        return out.size() > LIMIT ? out.subList(0, LIMIT) : out;
    }
}
