package com.maxsolch.shop.customer.app;

import com.maxsolch.shop.customer.domain.UserCardDto;
import com.maxsolch.shop.customer.infra.VisitorMapQueries;
import com.maxsolch.shop.customer.infra.VisitorMapQueries.UserAtPoint;
import com.maxsolch.shop.platform.web.GeoIpLookup;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Clock;
import java.util.List;
import java.util.Map;

/**
 * Reads for the admin users map: points aggregated by place from {@code visitor_locations}, the people behind one point
 * (with their order totals, asked from {@link OrderHistory}), and "online now" ({@link OnlineVisitors}).
 */
@Service
public class UserGeo {

    /** "Online now" = an event in the last few minutes (the apps flush their journal every ~15 s). */
    static final int ONLINE_WINDOW_MINUTES = 5;

    private final VisitorMapQueries map;
    private final OrderHistory orders;
    private final OnlineVisitors onlineVisitors;
    private final GeoIpLookup geo;
    private final Clock clock;

    public UserGeo(VisitorMapQueries map, OrderHistory orders, OnlineVisitors onlineVisitors, GeoIpLookup geo,
                   Clock clock) {
        this.map = map;
        this.orders = orders;
        this.onlineVisitors = onlineVisitors;
        this.geo = geo;
        this.clock = clock;
    }

    public static int clampDays(int days) {
        return Math.max(1, Math.min(days, VisitorLocationService.RETENTION_DAYS));
    }

    @Transactional(readOnly = true)
    public UserGeoDtos.Overview overview(int days) {
        int d = clampDays(days);
        List<UserGeoDtos.Point> points = map.points(d).stream()
                .map(p -> new UserGeoDtos.Point(p.lat(), p.lon(), p.city(), p.country(), p.countryCode(), p.visitors(),
                        p.users(), p.visitors() - p.users(), p.miniapp(), p.visitors() - p.miniapp(), p.lastSeen()))
                .toList();
        VisitorMapQueries.Totals totals = map.totals(d);
        return new UserGeoDtos.Overview(geo.available(), d, totals.visitors(), totals.withoutLocation(), points, online());
    }

    public UserGeoDtos.Online online() {
        OnlineVisitors.Counts c = onlineVisitors.within(ONLINE_WINDOW_MINUTES);
        return new UserGeoDtos.Online(c.miniapp(), c.web(), c.total(), ONLINE_WINDOW_MINUTES, clock.instant());
    }

    @Transactional(readOnly = true)
    public UserGeoDtos.PointDetails point(BigDecimal lat, BigDecimal lon, int days) {
        int d = clampDays(days);
        List<UserAtPoint> rows = map.usersAt(lat, lon, d);
        Map<Long, OrderHistory.Totals> totals = orders.totalsOf(rows.stream().map(UserAtPoint::telegramUserId).toList());
        List<UserGeoDtos.PointUser> users = rows.stream().map(r -> {
            OrderHistory.Totals t = totals.getOrDefault(r.telegramUserId(), OrderHistory.Totals.NONE);
            return new UserGeoDtos.PointUser(
                    new UserCardDto(r.telegramUserId(), r.username(), r.firstName(), r.lastName(), r.languageCode(),
                            r.premium(), r.botBlocked(), t.ordersCount(), t.spentMinor(), r.createdAt(), r.lastSeenAt(),
                            r.locale()),
                    r.ip(), r.channel(), r.city(), r.country(), r.seenAt());
        }).toList();
        List<UserGeoDtos.PointAnon> anon = map.anonymousAt(lat, lon, d).stream()
                .map(a -> new UserGeoDtos.PointAnon(a.ip(), a.seenAt())).toList();
        VisitorMapQueries.Place place = map.placeOf(lat, lon);
        return new UserGeoDtos.PointDetails(lat, lon, place.city(), place.country(), users, anon,
                map.anonymousTotalAt(lat, lon, d));
    }
}
