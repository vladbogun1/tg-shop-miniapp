package com.maxsolch.shop.analytics.infra;

import com.maxsolch.shop.analytics.domain.EventClassifier;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.Date;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * SQL of the behaviour journal: raw {@code client_events}, the rolled-up {@code analytics_daily*} tables,
 * the product-title lookup the classifier needs and the "top errors" list. The rules (what a day is, who is
 * staff, how events are classified) stay in {@code app}/{@code domain}; this class only reads and writes rows.
 */
@Repository
public class AnalyticsQueries {

    private final JdbcTemplate jdbc;

    public AnalyticsQueries(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** Creation time of the oldest journal event, or null for an empty journal. */
    public Instant oldestEventAt() {
        Timestamp oldest = jdbc.queryForObject("select min(created_at) from client_events", Timestamp.class);
        return oldest == null ? null : oldest.toInstant();
    }

    /** Days from {@code first} on that were rolled up at or after {@code notBefore}. */
    public Set<LocalDate> daysRolledUp(LocalDate first, Instant notBefore) {
        return new HashSet<>(jdbc.query(
                "select day from analytics_daily_runs where day >= ? and aggregated_at >= ?",
                (rs, i) -> rs.getDate(1).toLocalDate(), Date.valueOf(first), Timestamp.from(notBefore)));
    }

    /** The last rolled-up day, or null. */
    public LocalDate lastRolledDay() {
        return jdbc.query("select max(day) from analytics_daily_runs",
                rs -> rs.next() && rs.getDate(1) != null ? rs.getDate(1).toLocalDate() : null);
    }

    /** The first rolled-up day that had any event, or null. */
    public LocalDate firstRolledDayWithEvents() {
        return jdbc.query("select min(day) from analytics_daily_runs where events > 0",
                rs -> rs.next() && rs.getDate(1) != null ? rs.getDate(1).toLocalDate() : null);
    }

    public List<EventClassifier.VisitorDay> rolledVisitors(LocalDate from, LocalDate to) {
        return jdbc.query("select day, channel, visitor_key, telegram_user_id, stages, events "
                        + "from analytics_daily_visitors where day between ? and ?",
                (rs, i) -> {
                    long tg = rs.getLong("telegram_user_id");
                    // wasNull() right after the read: later reads would overwrite it (null became 0)
                    Long tgId = rs.wasNull() ? null : tg;
                    return new EventClassifier.VisitorDay(rs.getDate("day").toLocalDate(),
                            rs.getString("channel"), rs.getString("visitor_key"),
                            tgId, rs.getInt("stages"), rs.getInt("events"));
                }, Date.valueOf(from), Date.valueOf(to));
    }

    public List<EventClassifier.ProductDay> rolledProducts(LocalDate from, LocalDate to) {
        return jdbc.query("select day, channel, bin_to_uuid(product_id) pid, views, viewers, cart_adds "
                        + "from analytics_daily where day between ? and ?",
                (rs, i) -> new EventClassifier.ProductDay(rs.getDate("day").toLocalDate(),
                        rs.getString("channel"), rs.getString("pid"), rs.getInt("views"),
                        rs.getInt("viewers"), rs.getInt("cart_adds")), Date.valueOf(from), Date.valueOf(to));
    }

    /** Raw journal events in [from, to), optionally of one channel, in id order. */
    public List<EventClassifier.RawEvent> loadRaw(Instant from, Instant to, String channel) {
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

    /** Client-side errors (message, count, distinct people) since the given instant, most frequent first. */
    public List<Object[]> topErrors(Instant since, int limit) {
        return jdbc.query("select coalesce(target, '—') msg, count(*) c, count(distinct coalesce(telegram_user_id, anon_id)) u "
                        + "from client_events where event = 'error' and created_at >= ? "
                        + "group by msg order by c desc limit ?",
                (rs, i) -> new Object[]{rs.getString("msg"), rs.getLong("c"), rs.getLong("u")},
                Timestamp.from(since), limit);
    }

    /** Product title (as the app shows it, in any language) to product id, for classifying card labels. */
    public EventClassifier.TitleIndex loadTitleIndex() {
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

    /** Writes of one roll-up day; call inside a transaction so a day is replaced as a whole. */
    public void deleteRolledDay(LocalDate day) {
        Date d = Date.valueOf(day);
        jdbc.update("delete from analytics_daily_visitors where day = ?", d);
        jdbc.update("delete from analytics_daily where day = ?", d);
    }

    public void insertVisitorDays(LocalDate day, List<EventClassifier.VisitorDay> visitors) {
        Date d = Date.valueOf(day);
        List<Object[]> rows = new ArrayList<>();
        for (EventClassifier.VisitorDay v : visitors) {
            rows.add(new Object[]{d, v.channel(), v.visitorKey(), v.telegramUserId(), v.stages(), v.events()});
        }
        if (!rows.isEmpty()) {
            jdbc.batchUpdate("insert into analytics_daily_visitors "
                    + "(day, channel, visitor_key, telegram_user_id, stages, events) values (?,?,?,?,?,?)", rows);
        }
    }

    /** {@code productIds} are the 16-byte ids parallel to {@code products}. */
    public void insertProductDays(LocalDate day, List<EventClassifier.ProductDay> products, List<byte[]> productIds) {
        Date d = Date.valueOf(day);
        List<Object[]> rows = new ArrayList<>();
        for (int i = 0; i < products.size(); i++) {
            EventClassifier.ProductDay p = products.get(i);
            rows.add(new Object[]{d, p.channel(), productIds.get(i), p.views(), p.viewers(), p.cartAdds()});
        }
        if (!rows.isEmpty()) {
            jdbc.batchUpdate("insert into analytics_daily "
                    + "(day, channel, product_id, views, viewers, cart_adds) values (?,?,?,?,?,?)", rows);
        }
    }

    public void markDayRolledUp(LocalDate day, int events, Instant at) {
        jdbc.update("insert into analytics_daily_runs (day, events, aggregated_at) values (?, ?, ?) "
                        + "on duplicate key update events = values(events), aggregated_at = values(aggregated_at)",
                Date.valueOf(day), events, Timestamp.from(at));
    }
}
