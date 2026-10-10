package com.maxsolch.shop.analytics;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * The shop's own staff in the event journal, so their browsing never counts as customer behaviour
 * (funnel, product interest, visitors). Orders are not touched — an admin buying something is a
 * real sale.
 *
 * <p>Who is staff:
 * <ul>
 *   <li>every Telegram id in {@code admin_users} (active or not: a former admin's past browsing is
 *       still not a customer's) — that covers the Mini App, where a visitor is the Telegram id;</li>
 *   <li>every website browser ({@code anonId}) that has ever been signed in under such an id: the
 *       whole browser is left out, its anonymous visits before the sign-in too. Found in the journal,
 *       on the users map ({@code visitor_locations}) and in the rolled-up visitor days, so a browser
 *       stays known after its events are purged.</li>
 * </ul>
 * Browsers marked by the admin panel (cookie {@value #STAFF_COOKIE}) are not journalled at all —
 * see {@code PublicAnalyticsController}.
 *
 * <p>Product interest already rolled up into {@code analytics_daily} cannot be split by visitor:
 * days still in the 30-day journal are re-rolled without staff, older days keep what they had.
 */
@Component
public class StaffVisitors {

    /** Set by the admin panel on the shop's parent domain; the website's flushes carry it. */
    public static final String STAFF_COOKIE = "mx_staff";

    private static final long TTL_MILLIS = 5 * 60_000;

    private final JdbcTemplate jdbc;
    private volatile Staff cached;
    private volatile long cachedAt;

    public StaffVisitors(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** Staff Telegram ids and browsers. */
    public record Staff(Set<Long> telegramIds, Set<String> anonIds) {

        public static final Staff NONE = new Staff(Set.of(), Set.of());

        public boolean excludes(EventClassifier.RawEvent e) {
            return (e.telegramUserId() != null && telegramIds.contains(e.telegramUserId()))
                    || (e.anonId() != null && anonIds.contains(e.anonId()));
        }

        public boolean excludes(EventClassifier.VisitorDay v) {
            if (v.telegramUserId() != null && telegramIds.contains(v.telegramUserId())) {
                return true;
            }
            String key = v.visitorKey();
            if (key == null) {
                return false;
            }
            if (key.startsWith("a:")) {
                return anonIds.contains(key.substring(2));
            }
            if (key.startsWith("t:")) {
                try {
                    return telegramIds.contains(Long.parseLong(key.substring(2)));
                } catch (NumberFormatException e) {
                    return false;
                }
            }
            return false;
        }

        /** Without the staff's events; browsers seen signed in as staff in this batch are dropped too. */
        public List<EventClassifier.RawEvent> filter(List<EventClassifier.RawEvent> events) {
            Set<String> anon = new HashSet<>(anonIds);
            for (EventClassifier.RawEvent e : events) {
                if (e.anonId() != null && e.telegramUserId() != null && telegramIds.contains(e.telegramUserId())) {
                    anon.add(e.anonId());
                }
            }
            Staff all = new Staff(telegramIds, anon);
            return events.stream().filter(e -> !all.excludes(e)).toList();
        }
    }

    /** Current staff (cached for a few minutes; a new admin or browser shows up within that). */
    public Staff get() {
        long now = System.currentTimeMillis();
        Staff s = cached;
        if (s == null || now - cachedAt > TTL_MILLIS) {
            s = load();
            cached = s;
            cachedAt = now;
        }
        return s;
    }

    private Staff load() {
        Set<Long> ids = new HashSet<>(jdbc.queryForList("select telegram_user_id from admin_users", Long.class));
        if (ids.isEmpty()) {
            return Staff.NONE;
        }
        String admins = "(select telegram_user_id from admin_users)";
        Set<String> anon = new HashSet<>();
        anon.addAll(jdbc.queryForList("select distinct anon_id from client_events "
                + "where anon_id is not null and telegram_user_id in " + admins, String.class));
        anon.addAll(jdbc.queryForList("select distinct anon_id from visitor_locations "
                + "where anon_id is not null and telegram_user_id in " + admins, String.class));
        anon.addAll(jdbc.queryForList("select distinct substring(visitor_key, 3) from analytics_daily_visitors "
                + "where channel = 'WEB' and visitor_key like 'a:%' and telegram_user_id in " + admins, String.class));
        anon.remove(null);
        return new Staff(Set.copyOf(ids), Set.copyOf(anon));
    }
}
