package com.maxsolch.shop.analytics.app;

import com.maxsolch.shop.analytics.domain.EventClassifier;
import com.maxsolch.shop.analytics.infra.AnalyticsQueries;
import com.maxsolch.shop.platform.time.ShopZone;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;

/**
 * Reads funnel steps and product interest for any period: rolled-up days from
 * {@code analytics_daily*}, plus the days not rolled up yet (today, and yesterday before the night
 * run) classified on the fly from {@code client_events} with the same {@link EventClassifier}.
 */
@Component
public class AnalyticsReader {

    private static final long TITLE_TTL_MILLIS = 10 * 60_000;

    private final AnalyticsQueries queries;
    private final ZoneId zone;
    private final StaffVisitors staffVisitors;
    private final java.time.Clock clock;
    private volatile EventClassifier.TitleIndex titles;
    private volatile long titlesAt;

    public AnalyticsReader(AnalyticsQueries queries, ShopZone shopZone, StaffVisitors staffVisitors,
                           java.time.Clock clock) {
        this.clock = clock;
        this.queries = queries;
        this.zone = shopZone.zone();
        this.staffVisitors = staffVisitors;
    }

    public record Window(List<EventClassifier.VisitorDay> visitors,
                         List<EventClassifier.ProductDay> products,
                         LocalDate dataSince) {
    }

    /**
     * Visitor-days and product-days whose local day starts in [from, to), without the shop's staff
     * ({@link StaffVisitors}): their rolled-up visitor days are dropped on reading, their raw events
     * before classifying.
     */
    public Window read(Instant from, Instant to) {
        StaffVisitors.Staff staff = staffVisitors.get();
        LocalDate fromDay = LocalDate.ofInstant(from, zone);
        if (fromDay.atStartOfDay(zone).toInstant().isBefore(from)) {
            fromDay = fromDay.plusDays(1); // a partial first day is not a rolled-up day
        }
        LocalDate lastRolled = queries.lastRolledDay();

        List<EventClassifier.VisitorDay> visitors = new ArrayList<>();
        List<EventClassifier.ProductDay> products = new ArrayList<>();
        Instant rawFrom = from;
        if (lastRolled != null && !lastRolled.isBefore(fromDay)) {
            LocalDate toDay = LocalDate.ofInstant(to.minusMillis(1), zone);
            LocalDate rolledTo = lastRolled.isBefore(toDay) ? lastRolled : toDay;
            visitors.addAll(queries.rolledVisitors(fromDay, rolledTo).stream().filter(v -> !staff.excludes(v)).toList());
            products.addAll(queries.rolledProducts(fromDay, rolledTo));
            Instant afterRolled = rolledTo.plusDays(1).atStartOfDay(zone).toInstant();
            if (afterRolled.isAfter(rawFrom)) {
                rawFrom = afterRolled;
            }
        }
        if (rawFrom.isBefore(to)) {
            List<EventClassifier.RawEvent> raw = staff.filter(queries.loadRaw(rawFrom, to, null));
            if (!raw.isEmpty()) {
                EventClassifier.DayResult r = new EventClassifier(zone, titleIndex()).classify(raw);
                visitors.addAll(r.visitors());
                products.addAll(r.products());
            }
        }
        return new Window(visitors, products, dataSince());
    }

    /** First local day any behaviour data exists for (rolled up or still in the journal). */
    public LocalDate dataSince() {
        LocalDate rolled = queries.firstRolledDayWithEvents();
        Instant oldest = queries.oldestEventAt();
        LocalDate raw = oldest == null ? null : LocalDate.ofInstant(oldest, zone);
        if (rolled == null) {
            return raw;
        }
        return raw == null || rolled.isBefore(raw) ? rolled : raw;
    }

    /** Client-side errors (message -> count) since the given instant, most frequent first. */
    public List<Object[]> topErrors(Instant since, int limit) {
        return queries.topErrors(since, limit);
    }

    private EventClassifier.TitleIndex titleIndex() {
        long now = clock.millis();
        EventClassifier.TitleIndex t = titles;
        if (t == null || now - titlesAt > TITLE_TTL_MILLIS) {
            t = queries.loadTitleIndex();
            titles = t;
            titlesAt = now;
        }
        return t;
    }
}
