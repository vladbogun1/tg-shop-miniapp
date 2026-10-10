package com.maxsolch.shop.analytics;

import com.maxsolch.shop.common.UuidUtil;
import com.maxsolch.shop.config.AppProperties;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import java.sql.Date;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
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

    private final JdbcTemplate jdbc;
    private final TransactionTemplate tx;
    private final ZoneId zone;
    private final StaffVisitors staffVisitors;

    /**
     * Days rolled up before this moment still counted the staff's own browsing in product interest
     * ({@link StaffVisitors}); the ones still in the journal are rolled up again, once.
     */
    static final Instant STAFF_FILTER_SINCE = Instant.parse("2026-10-11T00:00:00Z");

    public AnalyticsAggregationService(JdbcTemplate jdbc, TransactionTemplate tx, AppProperties props,
                                       StaffVisitors staffVisitors) {
        this.jdbc = jdbc;
        this.tx = tx;
        this.zone = AnalyticsZone.of(props);
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

    @Scheduled(cron = "${app.analytics.rollup-cron:0 30 3 * * *}", zone = "${app.timezone:Europe/Kyiv}")
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
        LocalDate yesterday = LocalDate.now(zone).minusDays(1);
        Timestamp oldest = jdbc.queryForObject("select min(created_at) from client_events", Timestamp.class);
        if (oldest == null) {
            return 0;
        }
        // The oldest day is usually cut in half by the purge: start from the first complete one.
        LocalDate first = LocalDate.ofInstant(oldest.toInstant(), zone).plusDays(1);
        Set<LocalDate> done = new HashSet<>(jdbc.query(
                "select day from analytics_daily_runs where day >= ? and aggregated_at >= ?",
                (rs, i) -> rs.getDate(1).toLocalDate(), Date.valueOf(first), Timestamp.from(STAFF_FILTER_SINCE)));
        TitleLookup lookup = new TitleLookup(jdbc);
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
        List<EventClassifier.RawEvent> events = AnalyticsReader.loadRaw(jdbc, from, to, null);
        EventClassifier.DayResult result = classifyWithoutStaff(events, staffVisitors.get(), titles);
        tx.executeWithoutResult(status -> {
            Date d = Date.valueOf(day);
            jdbc.update("delete from analytics_daily_visitors where day = ?", d);
            jdbc.update("delete from analytics_daily where day = ?", d);
            List<Object[]> vRows = new ArrayList<>();
            for (EventClassifier.VisitorDay v : result.visitors()) {
                if (v.day().equals(day)) {
                    vRows.add(new Object[]{d, v.channel(), v.visitorKey(), v.telegramUserId(), v.stages(), v.events()});
                }
            }
            if (!vRows.isEmpty()) {
                jdbc.batchUpdate("insert into analytics_daily_visitors "
                        + "(day, channel, visitor_key, telegram_user_id, stages, events) values (?,?,?,?,?,?)", vRows);
            }
            List<Object[]> pRows = new ArrayList<>();
            for (EventClassifier.ProductDay p : result.products()) {
                byte[] pid = toBytesOrNull(p.productId());
                if (p.day().equals(day) && pid != null) {
                    pRows.add(new Object[]{d, p.channel(), pid, p.views(), p.viewers(), p.cartAdds()});
                }
            }
            if (!pRows.isEmpty()) {
                jdbc.batchUpdate("insert into analytics_daily "
                        + "(day, channel, product_id, views, viewers, cart_adds) values (?,?,?,?,?,?)", pRows);
            }
            jdbc.update("insert into analytics_daily_runs (day, events, aggregated_at) values (?, ?, ?) "
                    + "on duplicate key update events = values(events), aggregated_at = values(aggregated_at)",
                    d, events.size(), Timestamp.from(Instant.now()));
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
        private final JdbcTemplate jdbc;
        private EventClassifier.TitleIndex index;

        TitleLookup(JdbcTemplate jdbc) {
            this.jdbc = jdbc;
        }

        EventClassifier.TitleIndex index() {
            if (index == null) {
                index = load(jdbc);
            }
            return index;
        }

        static EventClassifier.TitleIndex load(JdbcTemplate jdbc) {
            Map<String, String> titles = new HashMap<>();
            jdbc.query("select bin_to_uuid(id) id, title from products",
                    rs -> {
                        titles.put(rs.getString("title"), rs.getString("id"));
                    });
            // Card labels are rendered in the reader's language: translated titles must match too.
            jdbc.query("select bin_to_uuid(entity_id) id, text from content_translations "
                            + "where entity_type = 'PRODUCT' and field = 'title'",
                    rs -> {
                        titles.putIfAbsent(rs.getString("text"), rs.getString("id"));
                    });
            return new EventClassifier.TitleIndex(titles);
        }
    }
}
