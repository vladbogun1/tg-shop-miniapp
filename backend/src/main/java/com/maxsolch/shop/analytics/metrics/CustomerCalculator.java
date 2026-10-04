package com.maxsolch.shop.analytics.metrics;

import com.maxsolch.shop.analytics.metrics.MetricsDtos.AovBucket;
import com.maxsolch.shop.analytics.metrics.MetricsDtos.CohortRow;
import com.maxsolch.shop.analytics.metrics.MetricsDtos.CustomerKpis;
import com.maxsolch.shop.analytics.metrics.MetricsDtos.Customers;
import com.maxsolch.shop.analytics.metrics.MetricsDtos.Kpi;
import com.maxsolch.shop.analytics.metrics.MetricsDtos.PromoRow;
import com.maxsolch.shop.analytics.metrics.MetricsDtos.RepeatBucket;
import com.maxsolch.shop.analytics.metrics.MetricsDtos.SignupWeek;
import com.maxsolch.shop.analytics.metrics.MetricsDtos.TopCustomer;
import com.maxsolch.shop.analytics.metrics.MetricsFacts.ItemFact;
import com.maxsolch.shop.analytics.metrics.MetricsFacts.OrderFact;
import com.maxsolch.shop.analytics.metrics.MetricsFacts.UserFact;

import java.time.DayOfWeek;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.ZoneId;
import java.time.temporal.TemporalAdjusters;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;

/**
 * The "Покупатели" tab. A buyer is a Telegram account with at least one order that was not rejected;
 * orders without a Telegram id (none so far) are left out of buyer counts.
 */
public final class CustomerCalculator {

    static final int COHORT_MONTHS = 6;
    static final int COHORT_ROWS = 12;
    static final int SIGNUP_WEEKS = 12;
    /** Basket bands in UAH (upper bounds); the last band is open. */
    static final long[] AOV_BOUNDS_UAH = {500, 1500, 3000, 6000};

    private final ZoneId zone;

    public CustomerCalculator(ZoneId zone) {
        this.zone = zone;
    }

    public Customers compute(MetricsFacts facts, MetricsPeriod period, ChannelFilter channel) {
        List<OrderFact> sold = facts.orders().stream()
                .filter(o -> !o.rejected() && o.tgUserId() != null && o.createdAt() != null)
                .toList();

        // First order per buyer over the whole history and all channels: "new" means new to the shop.
        Map<Long, Instant> firstOrder = new HashMap<>();
        Map<Long, Integer> orderCount = new HashMap<>();
        Map<Long, Long> lifetime = new HashMap<>();
        for (OrderFact o : sold) {
            firstOrder.merge(o.tgUserId(), o.createdAt(), (a, b) -> a.isBefore(b) ? a : b);
            if (channel.matches(o.source())) {
                orderCount.merge(o.tgUserId(), 1, Integer::sum);
                lifetime.merge(o.tgUserId(), o.totalMinor(), Long::sum);
            }
        }

        PeriodBuyers cur = buyers(sold, channel, period.from(), period.to(), firstOrder);
        PeriodBuyers prev = buyers(sold, channel, period.prevFrom(), period.prevTo(), firstOrder);
        boolean prevData = !prev.buyers.isEmpty();

        long ltvSum = lifetime.values().stream().mapToLong(Long::longValue).sum();
        long repeatAll = orderCount.values().stream().filter(c -> c >= 2).count();
        CustomerKpis kpis = new CustomerKpis(
                Kpi.of(cur.buyers.size(), prev.buyers.size(), prevData),
                Kpi.of(cur.newBuyers, prev.newBuyers, prevData),
                cur.repeat,
                cur.buyers.isEmpty() ? null : Stats.round1(cur.repeat * 100.0 / cur.buyers.size()),
                lifetime.isEmpty() ? 0 : ltvSum / lifetime.size(),
                orderCount.isEmpty() ? null : Stats.round1(repeatAll * 100.0 / orderCount.size()));

        long[] dist = new long[4];
        orderCount.values().forEach(c -> dist[Math.min(c, 4) - 1]++);
        List<RepeatBucket> repeat = List.of(
                new RepeatBucket("1 заказ", dist[0]),
                new RepeatBucket("2 заказа", dist[1]),
                new RepeatBucket("3 заказа", dist[2]),
                new RepeatBucket("4+ заказов", dist[3]));

        return new Customers(MetricsDtos.PeriodInfo.of(period, channel), kpis, repeat,
                cohorts(sold, channel, facts.now()),
                signups(facts.users(), firstOrder, facts.now()),
                topCustomers(facts.orders(), period, channel),
                promoCodes(facts.orders(), period, channel, firstOrder),
                aovBuckets(facts.orders(), period, channel),
                avgItems(facts, period, channel));
    }

    private record PeriodBuyers(Set<Long> buyers, long newBuyers, long repeat) {
    }

    private PeriodBuyers buyers(List<OrderFact> sold, ChannelFilter channel, Instant from, Instant to,
                                Map<Long, Instant> firstOrder) {
        Map<Long, Integer> inPeriod = new HashMap<>();
        for (OrderFact o : sold) {
            if (channel.matches(o.source()) && OverviewCalculator.in(o.createdAt(), from, to)) {
                inPeriod.merge(o.tgUserId(), 1, Integer::sum);
            }
        }
        long fresh = 0;
        long repeat = 0;
        for (Map.Entry<Long, Integer> e : inPeriod.entrySet()) {
            Instant first = firstOrder.get(e.getKey());
            boolean isNew = first != null && !first.isBefore(from);
            if (isNew) {
                fresh++;
            }
            if (!isNew || e.getValue() >= 2) {
                repeat++;
            }
        }
        return new PeriodBuyers(inPeriod.keySet(), fresh, repeat);
    }

    /** Month of first order × share of that cohort ordering again in each following month. */
    List<CohortRow> cohorts(List<OrderFact> sold, ChannelFilter channel, Instant now) {
        Map<Long, YearMonth> first = new HashMap<>();
        Map<Long, Set<YearMonth>> months = new HashMap<>();
        for (OrderFact o : sold) {
            if (!channel.matches(o.source())) {
                continue;
            }
            YearMonth m = YearMonth.from(o.createdAt().atZone(zone));
            first.merge(o.tgUserId(), m, (a, b) -> a.isBefore(b) ? a : b);
            months.computeIfAbsent(o.tgUserId(), k -> new HashSet<>()).add(m);
        }
        YearMonth current = YearMonth.from(now.atZone(zone));
        TreeMap<YearMonth, List<Long>> cohorts = new TreeMap<>();
        first.forEach((user, m) -> cohorts.computeIfAbsent(m, k -> new ArrayList<>()).add(user));
        List<CohortRow> out = new ArrayList<>();
        for (Map.Entry<YearMonth, List<Long>> e : cohorts.descendingMap().entrySet()) {
            if (out.size() >= COHORT_ROWS) {
                break;
            }
            YearMonth m = e.getKey();
            List<Double> pct = new ArrayList<>();
            for (int k = 1; k <= COHORT_MONTHS; k++) {
                YearMonth target = m.plusMonths(k);
                if (target.isAfter(current)) {
                    pct.add(null); // that month has not happened yet
                    continue;
                }
                long back = e.getValue().stream().filter(u -> months.get(u).contains(target)).count();
                pct.add(Stats.round1(back * 100.0 / e.getValue().size()));
            }
            out.add(new CohortRow(m.toString(), e.getValue().size(), pct));
        }
        return out;
    }

    /** New bot users per week and how many placed an order within 30 days of their first visit. */
    List<SignupWeek> signups(List<UserFact> users, Map<Long, Instant> firstOrder, Instant now) {
        LocalDate thisWeek = LocalDate.ofInstant(now, zone).with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
        LocalDate start = thisWeek.minusWeeks(SIGNUP_WEEKS - 1L);
        Map<LocalDate, long[]> acc = new TreeMap<>();
        for (int i = 0; i < SIGNUP_WEEKS; i++) {
            acc.put(start.plusWeeks(i), new long[2]);
        }
        for (UserFact u : users) {
            if (u.createdAt() == null) {
                continue;
            }
            LocalDate week = LocalDate.ofInstant(u.createdAt(), zone).with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
            long[] a = acc.get(week);
            if (a == null) {
                continue;
            }
            a[0]++;
            Instant first = firstOrder.get(u.telegramUserId());
            // An order placed before the bot saw them (imported history) still counts as converted.
            if (first != null && first.isBefore(u.createdAt().plus(Duration.ofDays(30)))) {
                a[1]++;
            }
        }
        List<SignupWeek> out = new ArrayList<>();
        acc.forEach((week, a) -> {
            boolean complete = !week.plusWeeks(1).atStartOfDay(zone).toInstant().plus(Duration.ofDays(30)).isAfter(now);
            out.add(new SignupWeek(week.toString(), a[0], a[1],
                    a[0] == 0 ? null : Stats.round1(a[1] * 100.0 / a[0]), complete));
        });
        return out;
    }

    /** Top customers by money actually received in the period. */
    List<TopCustomer> topCustomers(List<OrderFact> orders, MetricsPeriod period, ChannelFilter channel) {
        Map<Long, long[]> acc = new HashMap<>(); // orders, received, sold
        Map<Long, OrderFact> latest = new HashMap<>();
        for (OrderFact o : orders) {
            if (o.tgUserId() == null || !channel.matches(o.source())) {
                continue;
            }
            long[] a = null;
            if (period.contains(o.paidAt())) {
                a = acc.computeIfAbsent(o.tgUserId(), k -> new long[3]);
                a[1] += o.receivedMinor() - o.refundedMinor();
            }
            if (!o.rejected() && period.contains(o.createdAt())) {
                a = a != null ? a : acc.computeIfAbsent(o.tgUserId(), k -> new long[3]);
                a[0]++;
                a[2] += o.totalMinor();
            }
            if (a != null) {
                latest.merge(o.tgUserId(), o, (x, y) -> x.createdAt().isAfter(y.createdAt()) ? x : y);
            }
        }
        List<TopCustomer> out = new ArrayList<>();
        acc.forEach((user, a) -> {
            OrderFact last = latest.get(user);
            out.add(new TopCustomer(user, last == null ? null : last.customerName(),
                    last == null ? null : last.tgUsername(), a[0], a[1], a[2]));
        });
        out.sort(Comparator.comparingLong(TopCustomer::receivedMinor).reversed()
                .thenComparing(Comparator.comparingLong(TopCustomer::soldMinor).reversed()));
        return out.size() > 10 ? out.subList(0, 10) : out;
    }

    List<PromoRow> promoCodes(List<OrderFact> orders, MetricsPeriod period, ChannelFilter channel,
                              Map<Long, Instant> firstOrder) {
        Map<String, long[]> acc = new HashMap<>(); // created, rejected, orders, discount, sold, newBuyers
        for (OrderFact o : orders) {
            if (o.promoCode() == null || o.promoCode().isBlank() || !channel.matches(o.source())
                    || !period.contains(o.createdAt())) {
                continue;
            }
            long[] a = acc.computeIfAbsent(o.promoCode().trim().toUpperCase(Locale.ROOT), k -> new long[6]);
            a[0]++;
            if (o.rejected()) {
                a[1]++;
                continue;
            }
            a[2]++;
            a[3] += o.discountMinor();
            a[4] += o.totalMinor();
            if (o.tgUserId() != null && o.createdAt().equals(firstOrder.get(o.tgUserId()))) {
                a[5]++;
            }
        }
        List<PromoRow> out = new ArrayList<>();
        acc.forEach((code, a) -> out.add(new PromoRow(code, a[2], a[3], a[4], a[5],
                a[0] == 0 ? 0 : Stats.round1(a[1] * 100.0 / a[0]))));
        out.sort(Comparator.comparingLong(PromoRow::orders).reversed().thenComparing(PromoRow::code));
        return out;
    }

    List<AovBucket> aovBuckets(List<OrderFact> orders, MetricsPeriod period, ChannelFilter channel) {
        long[][] acc = new long[AOV_BOUNDS_UAH.length + 1][2];
        for (OrderFact o : orders) {
            if (o.rejected() || !channel.matches(o.source()) || !period.contains(o.createdAt())) {
                continue;
            }
            int i = 0;
            while (i < AOV_BOUNDS_UAH.length && o.totalMinor() >= AOV_BOUNDS_UAH[i] * 100) {
                i++;
            }
            acc[i][0]++;
            acc[i][1] += o.totalMinor();
        }
        List<AovBucket> out = new ArrayList<>();
        for (int i = 0; i < acc.length; i++) {
            String label = i == 0 ? "до " + AOV_BOUNDS_UAH[0] + " ₴"
                    : i == AOV_BOUNDS_UAH.length ? AOV_BOUNDS_UAH[i - 1] + "+ ₴"
                    : AOV_BOUNDS_UAH[i - 1] + "–" + AOV_BOUNDS_UAH[i] + " ₴";
            out.add(new AovBucket(label, acc[i][0], acc[i][1]));
        }
        return out;
    }

    double avgItems(MetricsFacts facts, MetricsPeriod period, ChannelFilter channel) {
        Map<String, OrderFact> byId = facts.orderById();
        Set<String> counted = new HashSet<>();
        long units = 0;
        for (ItemFact it : facts.items()) {
            OrderFact o = byId.get(it.orderId());
            if (o == null || o.rejected() || it.gift() || !channel.matches(o.source())
                    || !period.contains(o.createdAt())) {
                continue;
            }
            units += it.quantity();
            counted.add(o.id());
        }
        return counted.isEmpty() ? 0 : Stats.round2((double) units / counted.size());
    }
}
