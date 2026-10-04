package com.maxsolch.shop.analytics.metrics;

import com.maxsolch.shop.analytics.AnalyticsReader;
import com.maxsolch.shop.analytics.AnalyticsZone;
import com.maxsolch.shop.analytics.EventClassifier;
import com.maxsolch.shop.analytics.metrics.MetricsDtos.ErrorRow;
import com.maxsolch.shop.analytics.metrics.MetricsDtos.Reorder;
import com.maxsolch.shop.analytics.metrics.MetricsDtos.ReorderRow;
import com.maxsolch.shop.config.AppProperties;
import com.maxsolch.shop.domain.OrderStatus;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Entry point of the metrics page tabs and the board's "Today" strip: loads the facts once and hands
 * them to the pure calculators.
 */
@Service
public class AdminMetricsService {

    /** Allowed reorder horizons; anything else falls back to 30 days. */
    static final List<Integer> COVER_DAYS = List.of(14, 30, 60, 90);

    private final MetricsFactsLoader loader;
    private final AnalyticsReader analytics;
    private final ZoneId zone;

    public AdminMetricsService(MetricsFactsLoader loader, AnalyticsReader analytics, AppProperties props) {
        this.loader = loader;
        this.analytics = analytics;
        this.zone = AnalyticsZone.of(props);
    }

    public MetricsPeriod period(String token, String from, String to) {
        return MetricsPeriod.parse(token, from, to, zone, Instant.now());
    }

    public MetricsDtos.Overview overview(MetricsPeriod period, ChannelFilter channel) {
        MetricsFacts facts = loader.load();
        AnalyticsReader.Window window = analytics.read(period.from(), period.to());
        Map<String, Long> visitors = new HashMap<>();
        EventClassifier.stagesByVisitor(window.visitors()).keySet()
                .forEach(k -> visitors.merge(k.substring(0, k.indexOf('|')), 1L, Long::sum));
        return new OverviewCalculator(zone).compute(facts, period, channel, visitors);
    }

    public MetricsDtos.Stock stock(MetricsPeriod period, ChannelFilter channel, int deadDays, int coverDays) {
        MetricsFacts facts = loader.load();
        Map<String, ReorderCalculator.Interest> interest = interest30(facts.now());
        Reorder reorder = new ReorderCalculator().compute(facts, interest, normaliseCover(coverDays));
        int dead = StockCalculator.DEAD_DAYS.contains(deadDays) ? deadDays : StockCalculator.DEFAULT_DEAD_DAYS;
        return new StockCalculator().compute(facts, period, channel, dead, interest, reorder);
    }

    public MetricsDtos.Customers customers(MetricsPeriod period, ChannelFilter channel) {
        return new CustomerCalculator(zone).compute(loader.load(), period, channel);
    }

    public MetricsDtos.Funnel funnel(MetricsPeriod period, ChannelFilter channel) {
        AnalyticsReader.Window window = analytics.read(period.from(), period.to());
        return new FunnelCalculator(zone).compute(loader.load(), period, channel, window.visitors(),
                window.products(), window.dataSince());
    }

    public MetricsDtos.Operations operations(MetricsPeriod period, ChannelFilter channel) {
        List<ErrorRow> errors = analytics.topErrors(Instant.now().minus(Duration.ofDays(7)), 10).stream()
                .map(r -> new ErrorRow((String) r[0], (Long) r[1], (Long) r[2]))
                .toList();
        return new OperationsCalculator().compute(loader.load(), period, channel,
                loader.hasOrderColumn("reject_reason_code"), errors);
    }

    public MetricsDtos.Forecast forecast(ChannelFilter channel) {
        return new ForecastCalculator(zone).compute(loader.load(), channel);
    }

    public MetricsDtos.Today today() {
        MetricsFacts facts = loader.load();
        Instant now = facts.now();
        LocalDate day = LocalDate.ofInstant(now, zone);
        Instant todayStart = day.atStartOfDay(zone).toInstant();
        Instant yStart = day.minusDays(1).atStartOfDay(zone).toInstant();
        OverviewCalculator.Totals today = OverviewCalculator.totals(facts.orders(), ChannelFilter.ALL, todayStart, now);
        OverviewCalculator.Totals yesterday = OverviewCalculator.totals(facts.orders(), ChannelFilter.ALL, yStart, todayStart);
        OverviewCalculator.Totals ySameTime = OverviewCalculator.totals(facts.orders(), ChannelFilter.ALL, yStart,
                yStart.plus(Duration.between(todayStart, now)));

        long toApprove = 0;
        long toShip = 0;
        long awaiting = 0;
        long cod = 0;
        for (MetricsFacts.OrderFact o : facts.orders()) {
            if (o.status() == OrderStatus.NEW) {
                toApprove++;
            } else if (o.status() == OrderStatus.APPROVED) {
                toShip++;
            } else if (o.status() == OrderStatus.SHIPPED && o.totalMinor() > o.receivedMinor()) {
                cod += o.totalMinor() - o.receivedMinor();
            }
            if (OverviewCalculator.awaitingConfirmation(o)) {
                awaiting++;
            }
        }

        Reorder reorder = new ReorderCalculator().compute(facts, interest30(now), 30);
        List<ReorderRow> soon = reorder.rows().stream()
                .filter(r -> r.daysToZero() != null && r.daysToZero() <= ReorderCalculator.LOW_STOCK_DAYS)
                .toList();
        MetricsDtos.MonthForecast month = new ForecastCalculator(zone).compute(facts, ChannelFilter.ALL).month();
        return new MetricsDtos.Today(toApprove, toShip, awaiting,
                today.sold(), today.orders(), yesterday.sold(), ySameTime.sold(),
                today.received(), yesterday.received(), cod, soon.size(),
                soon.size() > 3 ? soon.subList(0, 3) : soon, month);
    }

    /** Views / unique viewers / adds to cart per product over the last 30 days, all channels. */
    Map<String, ReorderCalculator.Interest> interest30(Instant now) {
        AnalyticsReader.Window w = analytics.read(now.minus(Duration.ofDays(30)), now);
        Map<String, long[]> acc = new HashMap<>();
        for (EventClassifier.ProductDay p : w.products()) {
            long[] a = acc.computeIfAbsent(p.productId(), k -> new long[3]);
            a[0] += p.views();
            a[1] += p.viewers();
            a[2] += p.cartAdds();
        }
        Map<String, ReorderCalculator.Interest> out = new HashMap<>();
        acc.forEach((k, a) -> out.put(k, new ReorderCalculator.Interest(a[0], a[1], a[2])));
        return out;
    }

    static int normaliseCover(int days) {
        return COVER_DAYS.contains(days) ? days : 30;
    }
}
