package com.maxsolch.shop.customer.app;

import com.maxsolch.shop.platform.time.ShopZone;
import com.maxsolch.shop.platform.time.TimeRange;
import com.maxsolch.shop.customer.domain.UserCardDto;
import com.maxsolch.shop.customer.infra.UserListQueries;
import com.maxsolch.shop.customer.infra.UserListQueries.Column;
import com.maxsolch.shop.customer.infra.UserListQueries.UserRow;
import com.maxsolch.shop.customer.infra.UserRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

/** Admin-facing user list + user analytics. */
@Service
public class UserAdminService {

    private static final String CURRENCY = "UAH";
    /**
     * Day buckets of "new users per day" in the business timezone (app.timezone), like the order
     * metrics. In UTC, everyone who arrived between 00:00 and 03:00 Kyiv time landed in "yesterday".
     */
    private final DateTimeFormatter day;

    /** Whitelisted sort columns of the users table; everything else falls back to the signup date. */
    private static final Map<String, Column> SORT_COLUMNS = Map.of(
            "createdAt", Column.CREATED_AT,
            "lastSeenAt", Column.LAST_SEEN_AT,
            "username", Column.USERNAME,
            "telegramUserId", Column.TELEGRAM_USER_ID);
    /** The two sorts that need the order totals (the computed columns of the list). */
    private static final java.util.Set<String> ORDER_SORTS = java.util.Set.of("ordersCount", "totalSpentMinor");

    private final UserListQueries users;
    private final OrderHistory orders;
    private final UserRepository userRepository;
    private final Clock clock;

    public UserAdminService(UserListQueries users, OrderHistory orders, UserRepository userRepository, ShopZone shopZone,
                            Clock clock) {
        this.users = users;
        this.orders = orders;
        this.userRepository = userRepository;
        this.clock = clock;
        this.day = DateTimeFormatter.ofPattern("yyyy-MM-dd").withZone(shopZone.zone());
    }

    /**
     * LIKE pattern of the users search, null when there is nothing to search. The field's hint is
     * «имя, @username, ID», but usernames are stored without the «@» — so it is dropped. «%» is
     * removed and «_» (common in usernames) escaped, so neither acts as a LIKE wildcard.
     */
    static String searchPattern(String q) {
        if (q == null) {
            return null;
        }
        String t = q.trim();
        if (t.startsWith("@")) {
            t = t.substring(1);
        }
        t = t.toLowerCase(java.util.Locale.ROOT).replace("%", "").replace("_", "\\_").trim();
        return t.isEmpty() ? null : "%" + t + "%";
    }

    @Transactional(readOnly = true)
    public List<UserCardDto> list(String q, boolean blockedOnly, int page, int size, String sortBy, String sortDir) {
        String like = searchPattern(q);
        boolean hasQ = like != null;
        if (like == null) {
            like = "";
        }
        boolean asc = "asc".equalsIgnoreCase(sortDir);
        int sz = Math.max(1, Math.min(size, 100));
        int off = Math.max(0, page) * sz;

        if (ORDER_SORTS.contains(sortBy)) {
            return sortedByOrders(hasQ, like, blockedOnly, "ordersCount".equals(sortBy), asc, sz, off);
        }
        List<UserRow> rows = users.page(hasQ, like, blockedOnly, SORT_COLUMNS.getOrDefault(sortBy, Column.CREATED_AT), asc, sz, off);
        Map<Long, OrderHistory.Totals> totals = orders.totalsOf(rows.stream().map(UserRow::telegramUserId).toList());
        return rows.stream().map(r -> toCard(r, totals)).toList();
    }

    /**
     * Sorting by the number of orders or the money spent: the totals come from the owner of the orders, so the order is
     * made here (ties: the newest Telegram id first, as in the other sorts) and only the page is read from the users table.
     */
    private List<UserCardDto> sortedByOrders(boolean hasQ, String like, boolean blockedOnly, boolean byCount, boolean asc,
                                             int size, int offset) {
        Map<Long, OrderHistory.Totals> totals = orders.totalsOfAll();
        java.util.function.ToLongFunction<Long> value = id -> {
            OrderHistory.Totals t = totals.getOrDefault(id, OrderHistory.Totals.NONE);
            return byCount ? t.ordersCount() : t.spentMinor();
        };
        java.util.Comparator<Long> byValue = java.util.Comparator.comparingLong(value::applyAsLong);
        List<Long> ids = users.matchingIds(hasQ, like, blockedOnly).stream()
                .sorted((asc ? byValue : byValue.reversed()).thenComparing(java.util.Comparator.<Long>reverseOrder()))
                .skip(offset).limit(size).toList();
        return users.byIds(ids).stream().map(r -> toCard(r, totals)).toList();
    }

    private static UserCardDto toCard(UserRow r, Map<Long, OrderHistory.Totals> totals) {
        OrderHistory.Totals t = totals.getOrDefault(r.telegramUserId(), OrderHistory.Totals.NONE);
        return new UserCardDto(r.telegramUserId(), r.username(), r.firstName(), r.lastName(), r.languageCode(),
                r.premium(), r.botBlocked(), t.ordersCount(), t.spentMinor(), r.createdAt(), r.lastSeenAt(), r.locale());
    }

    @Transactional(readOnly = true)
    public UserMetricsDto metrics(TimeRange range) {
        long total = userRepository.count();
        long blocked = userRepository.countByBotBlockedTrue();
        long premium = userRepository.countByPremiumTrue();
        long active = orders.countCustomersWithOrders();
        long inactive = Math.max(0, total - active);

        Instant from = range.from(clock.instant());
        List<Instant> created = userRepository.createdAtsSince(from);
        long newInRange = created.size();

        Map<String, Long> byDay = new TreeMap<>();
        for (Instant ts : created) {
            if (ts == null) continue;
            byDay.merge(day.format(ts), 1L, Long::sum);
        }
        List<UserMetricsDto.CountByDay> newUsersByDay = byDay.entrySet().stream()
                .map(e -> new UserMetricsDto.CountByDay(e.getKey(), e.getValue()))
                .toList();

        List<UserMetricsDto.LanguageCount> languages = userRepository.languageCounts().stream()
                .map(r -> new UserMetricsDto.LanguageCount(
                        r[0] == null ? "—" : r[0].toString(),
                        ((Number) r[1]).longValue()))
                .limit(10)
                .toList();

        List<UserMetricsDto.TopCustomer> topCustomers = orders.topCustomers(10);

        return new UserMetricsDto(range.name().toLowerCase(), CURRENCY, total, newInRange,
                active, inactive, blocked, premium, newUsersByDay, languages, topCustomers);
    }
}
