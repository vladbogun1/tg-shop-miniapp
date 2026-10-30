package com.maxsolch.shop.analytics.app;

import com.maxsolch.shop.analytics.domain.EventClassifier;
import com.maxsolch.shop.analytics.infra.AnalyticsQueries;
import com.maxsolch.shop.platform.time.ShopZone;
import com.maxsolch.shop.platform.util.UuidUtil;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * Rolls the short-lived {@code client_events} journal up into {@code analytics_daily*}, one closed
 * day (shop timezone) at a time, so the funnel and product interest survive the 30-day purge.
 *
 * <p>Runs nightly before the purge and once on startup (which also backfills every day still in the
 * journal). A day is rewritten as a whole (delete + insert) and then marked in
 * {@code analytics_daily_runs}, so a rerun is harmless. Days that are not rolled up yet — today, and
 * yesterday before the night run — are classified straight from the journal by
 * {@link AnalyticsReader}, with the same {@link EventClassifier}.
 */
@Slf4j
@Service
public class AnalyticsAggregationService {

    private final AnalyticsQueries queries;
    private final TransactionTemplate tx;
    private final ZoneId zone;
    private final Clock clock;
    private final StaffVisitors staffVisitors;

    /**
     * Days rolled up before this moment still counted the staff's own browsing in product interest
     * ({@link StaffVisitors}); the ones still in the journal are rolled up again, once.
     */
    static final Instant STAFF_FILTER_SINCE = Instant.parse("2026-10-11T00:00:00Z");

    public AnalyticsAggregationService(AnalyticsQueries queries, TransactionTemplate tx, ShopZone shopZone,
                                       Clock clock, StaffVisitors staffVisitors) {
        this.queries = queries;
        this.tx = tx;
        this.zone = shopZone.zone();
        this.clock = clock;
        this.staffVisitors = staffVisitors;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void onStartup() {
        try {
            aggregatePending();
        } catch (Exception e) {
            log.warn("Analytics roll-up on startup failed: {}", e.toString());
        }
    }

    /** Called by {@link AnalyticsJobs} every night; a failure is logged, the next night retries. */
    public void nightly() {
        try {
            aggregatePending();
        } catch (Exception e) {
            log.error("Nightly analytics roll-up failed", e);
        }
    }

    /**
     * Rolls up every closed day still fully present in the journal and not rolled up yet (or rolled
     * up before the staff were left out).
     */
    public int aggregatePending() {
        LocalDate yesterday = LocalDate.now(clock.withZone(zone)).minusDays(1);
        Instant oldest = queries.oldestEventAt();
        if (oldest == null) {
            return 0;
        }
        // The oldest day is usually cut in half by the purge: start from the first complete one.
        LocalDate first = LocalDate.ofInstant(oldest, zone).plusDays(1);
        Set<LocalDate> done = queries.daysRolledUp(first, STAFF_FILTER_SINCE);
        TitleLookup lookup = new TitleLookup(queries);
        int count = 0;
        for (LocalDate day = first; !day.isAfter(yesterday); day = day.plusDays(1)) {
            if (!done.contains(day)) {
                aggregateDay(day, lookup.index());
                count++;
            }
        }
        if (count > 0) {
            log.info("Rolled up {} day(s) of client events", count);
        }
        return count;
    }

    void aggregateDay(LocalDate day, EventClassifier.TitleIndex titles) {
        Instant from = day.atStartOfDay(zone).toInstant();
        Instant to = day.plusDays(1).atStartOfDay(zone).toInstant();
        List<EventClassifier.RawEvent> events = queries.loadRaw(from, to, null);
        EventClassifier.DayResult result = classifyWithoutStaff(events, staffVisitors.get(), titles);
        List<EventClassifier.VisitorDay> visitors = result.visitors().stream()
                .filter(v -> v.day().equals(day)).toList();
        List<EventClassifier.ProductDay> products = new ArrayList<>();
        List<byte[]> productIds = new ArrayList<>();
        for (EventClassifier.ProductDay p : result.products()) {
            byte[] pid = toBytesOrNull(p.productId());
            if (p.day().equals(day) && pid != null) {
                products.add(p);
                productIds.add(pid);
            }
        }
        tx.executeWithoutResult(status -> {
            queries.deleteRolledDay(day);
            queries.insertVisitorDays(day, visitors);
            queries.insertProductDays(day, products, productIds);
            queries.markDayRolledUp(day, events.size(), clock.instant());
        });
    }

    /**
     * Product interest without the staff's events. Their visitor days are kept (the reader drops
     * them): a staff browser's sign-in day is what keeps it known after the journal is purged.
     */
    EventClassifier.DayResult classifyWithoutStaff(List<EventClassifier.RawEvent> events, StaffVisitors.Staff staff,
                                                  EventClassifier.TitleIndex titles) {
        EventClassifier classifier = new EventClassifier(zone, titles);
        List<EventClassifier.RawEvent> customers = staff.filter(events);
        EventClassifier.DayResult result = classifier.classify(customers);
        if (customers.size() == events.size()) {
            return result;
        }
        Set<Long> kept = new HashSet<>();
        customers.forEach(e -> kept.add(e.id()));
        List<EventClassifier.RawEvent> staffOnly = events.stream().filter(e -> !kept.contains(e.id())).toList();
        List<EventClassifier.VisitorDay> visitors = new ArrayList<>(result.visitors());
        visitors.addAll(classifier.classify(staffOnly).visitors());
        return new EventClassifier.DayResult(visitors, result.products());
    }

    private static byte[] toBytesOrNull(String uuid) {
        try {
            return uuid == null ? null : UuidUtil.toBytes(uuid);
        } catch (Exception e) {
            return null;
        }
    }

    /** Builds the title index lazily (only when there is a day to roll up). */
    static final class TitleLookup {
        private final AnalyticsQueries queries;
        private EventClassifier.TitleIndex index;

        TitleLookup(AnalyticsQueries queries) {
            this.queries = queries;
        }

        EventClassifier.TitleIndex index() {
            if (index == null) {
                index = queries.loadTitleIndex();
            }
            return index;
        }
    }
}
