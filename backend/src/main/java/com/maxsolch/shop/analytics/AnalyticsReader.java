package com.maxsolch.shop.analytics;

import com.maxsolch.shop.config.AppProperties;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.sql.Date;
import java.sql.Timestamp;
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

    private final JdbcTemplate jdbc;
    private final ZoneId zone;
    private volatile EventClassifier.TitleIndex titles;
    private volatile long titlesAt;

    public AnalyticsReader(JdbcTemplate jdbc, AppProperties props) {
        this.jdbc = jdbc;
        this.zone = AnalyticsZone.of(props);
    }

    public record Window(List<EventClassifier.VisitorDay> visitors,
                         List<EventClassifier.ProductDay> products,
                         LocalDate dataSince) {
    }

    /** Visitor-days and product-days whose local day starts in [from, to). */
    public Window read(Instant from, Instant to) {
        LocalDate fromDay = LocalDate.ofInstant(from, zone);
        if (fromDay.atStartOfDay(zone).toInstant().isBefore(from)) {
            fromDay = fromDay.plusDays(1); // a partial first day is not a rolled-up day
        }
        LocalDate lastRolled = jdbc.query("select max(day) from analytics_daily_runs",
                rs -> rs.next() && rs.getDate(1) != null ? rs.getDate(1).toLocalDate() : null);

        List<EventClassifier.VisitorDay> visitors = new ArrayList<>();
        List<EventClassifier.ProductDay> products = new ArrayList<>();
        Instant rawFrom = from;
        if (lastRolled != null && !lastRolled.isBefore(fromDay)) {
            LocalDate toDay = LocalDate.ofInstant(to.minusMillis(1), zone);
            LocalDate rolledTo = lastRolled.isBefore(toDay) ? lastRolled : toDay;
            Date a = Date.valueOf(fromDay);
            Date b = Date.valueOf(rolledTo);
            visitors.addAll(jdbc.query("select day, channel, visitor_key, telegram_user_id, stages, events "
                            + "from analytics_daily_visitors where day between ? and ?",
                    (rs, i) -> {
                        long tg = rs.getLong("telegram_user_id");
                        return new EventClassifier.VisitorDay(rs.getDate("day").toLocalDate(),
                                rs.getString("channel"), rs.getString("visitor_key"),
                                rs.wasNull() ? null : tg, rs.getInt("stages"), rs.getInt("events"));
                    }, a, b));
            products.addAll(jdbc.query("select day, channel, bin_to_uuid(product_id) pid, views, viewers, cart_adds "
                            + "from analytics_daily where day between ? and ?",
                    (rs, i) -> new EventClassifier.ProductDay(rs.getDate("day").toLocalDate(),
                            rs.getString("channel"), rs.getString("pid"), rs.getInt("views"),
                            rs.getInt("viewers"), rs.getInt("cart_adds")), a, b));
            Instant afterRolled = rolledTo.plusDays(1).atStartOfDay(zone).toInstant();
            if (afterRolled.isAfter(rawFrom)) {
                rawFrom = afterRolled;
            }
        }
        if (rawFrom.isBefore(to)) {
            List<EventClassifier.RawEvent> raw = loadRaw(jdbc, rawFrom, to, null);
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
        LocalDate rolled = jdbc.query("select min(day) from analytics_daily_runs where events > 0",
                rs -> rs.next() && rs.getDate(1) != null ? rs.getDate(1).toLocalDate() : null);
        Timestamp oldest = jdbc.queryForObject("select min(created_at) from client_events", Timestamp.class);
        LocalDate raw = oldest == null ? null : LocalDate.ofInstant(oldest.toInstant(), zone);
        if (rolled == null) {
            return raw;
        }
        return raw == null || rolled.isBefore(raw) ? rolled : raw;
    }

    /** Client-side errors (message -> count) since the given instant, most frequent first. */
    public List<Object[]> topErrors(Instant since, int limit) {
        return jdbc.query("select coalesce(target, '—') msg, count(*) c, count(distinct coalesce(telegram_user_id, anon_id)) u "
                        + "from client_events where event = 'error' and created_at >= ? "
                        + "group by msg order by c desc limit ?",
                (rs, i) -> new Object[]{rs.getString("msg"), rs.getLong("c"), rs.getLong("u")},
                Timestamp.from(since), limit);
    }

    private EventClassifier.TitleIndex titleIndex() {
        long now = System.currentTimeMillis();
        EventClassifier.TitleIndex t = titles;
        if (t == null || now - titlesAt > TITLE_TTL_MILLIS) {
            t = AnalyticsAggregationService.TitleLookup.load(jdbc);
            titles = t;
            titlesAt = now;
        }
        return t;
    }

    static List<EventClassifier.RawEvent> loadRaw(JdbcTemplate jdbc, Instant from, Instant to, String channel) {
        String sql = "select id, channel, telegram_user_id, anon_id, session_id, event, target, path, "
                + "bin_to_uuid(product_id) pid, created_at from client_events "
                + "where created_at >= ? and created_at < ?"
                + (channel == null ? "" : " and channel = ?")
                + " order by id";
        Object[] args = channel == null
                ? new Object[]{Timestamp.from(from), Timestamp.from(to)}
                : new Object[]{Timestamp.from(from), Timestamp.from(to), channel};
        return jdbc.query(sql, (rs, i) -> {
            long tg = rs.getLong("telegram_user_id");
            Long tgId = rs.wasNull() ? null : tg;
            return new EventClassifier.RawEvent(rs.getLong("id"), rs.getString("channel"), tgId,
                    rs.getString("anon_id"), rs.getString("session_id"), rs.getString("event"),
                    rs.getString("target"), rs.getString("path"), rs.getString("pid"),
                    rs.getTimestamp("created_at").toInstant());
        }, args);
    }
}
