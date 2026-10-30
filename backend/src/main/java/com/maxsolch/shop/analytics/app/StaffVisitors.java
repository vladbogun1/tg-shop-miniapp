package com.maxsolch.shop.analytics.app;

import com.maxsolch.shop.platform.cache.CacheConfig;
import org.springframework.cache.Cache;
import org.springframework.cache.CacheManager;
import com.maxsolch.shop.analytics.domain.EventClassifier;
import com.maxsolch.shop.analytics.infra.StaffQueries;
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

    private final StaffQueries queries;
    private final Cache cached;


    public StaffVisitors(StaffQueries queries, CacheManager caches) {
        this.cached = CacheConfig.require(caches, AnalyticsReadCaches.STAFF.name());
        this.queries = queries;
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
        Staff s = cached.get(AnalyticsReadCaches.KEY, Staff.class);
        if (s == null) {
            s = load();
            cached.put(AnalyticsReadCaches.KEY, s);
        }
        return s;
    }

    private Staff load() {
        Set<Long> ids = queries.adminTelegramIds();
        if (ids.isEmpty()) {
            return Staff.NONE;
        }
        Set<String> anon = queries.adminBrowsers();
        anon.remove(null);
        return new Staff(Set.copyOf(ids), Set.copyOf(anon));
    }
}
