package com.maxsolch.shop.gift.app;

import com.maxsolch.shop.gift.domain.GiftLine;
import com.maxsolch.shop.gift.domain.GiftPerson;
import com.maxsolch.shop.gift.infra.GiftRegistryStore;
import com.maxsolch.shop.platform.time.ShopZone;
import com.maxsolch.shop.platform.util.UuidUtil;
import com.maxsolch.shop.order.domain.Order;
import com.maxsolch.shop.gift.app.GiftDtos.GiftRegistryDto;
import com.maxsolch.shop.gift.app.GiftDtos.GiftRegistryRowDto;
import com.maxsolch.shop.platform.settings.SettingsRegistry;
import com.maxsolch.shop.platform.settings.SettingsService;
import com.maxsolch.shop.platform.error.DomainException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.format.DateTimeParseException;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Gifts handed to customers (docs/GIFT-CASE.md, «Реестр подарков и месячный лимит»): every gift line
 * of a not rejected order — a case prize, the gift for the order sum, an admin's gift — at its usual
 * price ({@code order_items.gift_value_minor}, V64).
 *
 * <p>A gift is income of the person (ПКУ пп. 165.1.39): untaxed while the gifts from the shop in a
 * month stay within 25 % of the minimum wage (setting {@code gift.monthlyLimitUah}). The draw keeps a
 * person under it ({@link #remainingMinor}) and the registry is the record for the accountant.
 *
 * <p>One person = orders sharing a site account, a Telegram id or a phone number (the last 9 digits),
 * joined transitively. The month of a gift is the month it was delivered; a gift not delivered yet
 * counts in the month of its order and always against the current limit.
 */
@Service
public class GiftRegistryService {

    private static final ZoneId ZONE = ShopZone.DEFAULT;

    /** How far back undelivered gifts are still looked at (an order older than this is long settled). */
    static final Duration LOOKBACK = Duration.ofDays(120);

    private final GiftRegistryStore store;
    private final Clock clock;
    private final SettingsService settings;

    public GiftRegistryService(GiftRegistryStore store, SettingsService settings, Clock clock) {
        this.store = store;
        this.clock = clock;
        this.settings = settings;
    }

    /** The limit for the order with this id (text from the request); 400 for a bad id, 404 without the order. */
    public GiftDtos.GiftLimitDto limitForOrder(String orderId) {
        byte[] id;
        try {
            id = UuidUtil.toBytes(orderId.trim());
        } catch (IllegalArgumentException e) {
            throw new DomainException.BadRequest("Неверный id заказа");
        }
        return limitForOrder(id, clock.instant())
                .orElseThrow(() -> new DomainException.NotFound("Заказ не найден"));
    }

    /** The registry for dates given as {@code YYYY-MM-DD} text. */
    public GiftRegistryDto registry(String from, String to) {
        try {
            return registry(LocalDate.parse(from), LocalDate.parse(to));
        } catch (DateTimeParseException e) {
            throw new DomainException.BadRequest("Дата — в формате ГГГГ-ММ-ДД");
        }
    }

    /** The person of an order as the registry keys them. */
    public static GiftPerson personOf(Order o) {
        return new GiftPerson(o.getUserId(), o.getTgUserId(), GiftPerson.phoneKey(o.getPhone()));
    }

    /** The monthly limit per person, kopecks; 0 = no limit. */
    public long limitMinor() {
        return Math.max(0, settings.getInt(SettingsRegistry.GIFT_MONTHLY_LIMIT_UAH)) * 100L;
    }

    /**
     * How much more a person may be given this month, kopecks: the limit minus their gifts delivered
     * this month and not delivered yet. {@link Long#MAX_VALUE} when there is no limit.
     */
    @Transactional(readOnly = true)
    public long remainingMinor(GiftPerson person, Instant now) {
        long limit = limitMinor();
        if (limit <= 0) {
            return Long.MAX_VALUE;
        }
        YearMonth month = YearMonth.from(now.atZone(ZONE));
        Instant since = month.atDay(1).atStartOfDay(ZONE).toInstant().minus(LOOKBACK);
        long used = usedMinor(person, store.lines(since), month);
        return Math.max(0, limit - used);
    }

    /**
     * The limit as an admin giving a gift to an order sees it: the order's person, this month. Their
     * gifts already in this order count too. Empty when the order does not exist.
     */
    @Transactional(readOnly = true)
    public Optional<GiftDtos.GiftLimitDto> limitForOrder(byte[] orderId, Instant now) {
        Optional<GiftPerson> found = store.personOfOrder(orderId);
        if (found.isEmpty()) {
            return Optional.empty();
        }
        YearMonth month = YearMonth.from(now.atZone(ZONE));
        Instant since = month.atDay(1).atStartOfDay(ZONE).toInstant().minus(LOOKBACK);
        long used = usedMinor(found.get(), store.lines(since), month);
        long limit = limitMinor();
        return Optional.of(new GiftDtos.GiftLimitDto(month.toString(), limit, used,
                limit > 0 ? Math.max(0, limit - used) : -1));
    }

    /** The person's gifts (with everyone joined to them) delivered in {@code month} or not delivered yet. */
    static long usedMinor(GiftPerson person, List<GiftLine> lines, YearMonth month) {
        List<GiftLine> all = new ArrayList<>(lines);
        int[] group = groups(all.stream().map(GiftLine::person).toList(), person);
        long used = 0;
        for (int i = 0; i < all.size(); i++) {
            GiftLine l = all.get(i);
            if (group[i] == group[all.size()] && (l.deliveredAt() == null || l.month().equals(month))) {
                used += l.valueMinor();
            }
        }
        return used;
    }

    /**
     * The registry for the dates {@code from}..{@code to} (inclusive, Kyiv): the gifts handed over in
     * that span, each with the person's total for its month and whether it is over the limit.
     */
    @Transactional(readOnly = true)
    public GiftRegistryDto registry(LocalDate from, LocalDate to) {
        if (from == null || to == null || to.isBefore(from)) {
            throw new DomainException.BadRequest("Неверный период");
        }
        if (Duration.between(from.atStartOfDay(), to.atStartOfDay()).toDays() > 400) {
            throw new DomainException.BadRequest("Период — не больше года");
        }
        Instant start = from.atStartOfDay(ZONE).toInstant();
        Instant end = to.plusDays(1).atStartOfDay(ZONE).toInstant();
        // Whole months around the span, so a month total also counts gifts outside the shown dates.
        Instant since = YearMonth.from(from).atDay(1).atStartOfDay(ZONE).toInstant().minus(LOOKBACK);
        List<GiftLine> lines = store.lines(since);
        int[] group = groups(lines.stream().map(GiftLine::person).toList(), null);

        Map<String, Long> monthTotal = new HashMap<>();
        for (int i = 0; i < lines.size(); i++) {
            monthTotal.merge(group[i] + "|" + lines.get(i).month(), lines.get(i).valueMinor(), Long::sum);
        }
        long limit = limitMinor();
        List<GiftRegistryRowDto> rows = new ArrayList<>();
        long sum = 0;
        java.util.Set<Integer> people = new java.util.HashSet<>();
        java.util.Set<Integer> over = new java.util.HashSet<>();
        for (int i = 0; i < lines.size(); i++) {
            GiftLine l = lines.get(i);
            Instant date = l.date();
            if (date.isBefore(start) || !date.isBefore(end)) {
                continue;
            }
            long total = monthTotal.get(group[i] + "|" + l.month());
            boolean overLimit = limit > 0 && total > limit;
            rows.add(new GiftRegistryRowDto(l.orderId(), l.createdAt(), l.deliveredAt(), l.status(),
                    l.customerName(), l.phone(), l.tgUsername(), "P" + group[i], l.title(), l.variant(),
                    l.quantity(), l.unitMinor(), l.valueMinor(), l.source(), l.tier(), l.month().toString(), total,
                    overLimit));
            sum += l.valueMinor();
            people.add(group[i]);
            if (overLimit) {
                over.add(group[i]);
            }
        }
        rows.sort(Comparator.comparing((GiftRegistryRowDto r) -> r.deliveredAt() != null ? r.deliveredAt() : r.createdAt())
                .thenComparing(GiftRegistryRowDto::orderId));
        return new GiftRegistryDto(from.toString(), to.toString(), limit, rows.size(), sum, people.size(),
                over.size(), rows);
    }

    /**
     * Joins people that share any key (union–find). With {@code extra} non-null it takes the index
     * {@code people.size()}, so the caller can ask which lines belong to it.
     */
    static int[] groups(List<GiftPerson> people, GiftPerson extra) {
        List<GiftPerson> all = new ArrayList<>(people);
        if (extra != null) {
            all.add(extra);
        }
        int[] parent = new int[all.size()];
        for (int i = 0; i < parent.length; i++) {
            parent[i] = i;
        }
        Map<String, Integer> firstByKey = new HashMap<>();
        for (int i = 0; i < all.size(); i++) {
            GiftPerson p = all.get(i);
            for (String key : new String[]{
                    p.userId() == null ? null : "u" + p.userId(),
                    p.tgUserId() == null ? null : "t" + p.tgUserId(),
                    p.phoneKey() == null ? null : "p" + p.phoneKey()}) {
                if (key == null) {
                    continue;
                }
                Integer first = firstByKey.putIfAbsent(key, i);
                if (first != null) {
                    union(parent, first, i);
                }
            }
        }
        int[] out = new int[all.size()];
        for (int i = 0; i < all.size(); i++) {
            out[i] = find(parent, i);
        }
        return out;
    }

    private static int find(int[] parent, int i) {
        while (parent[i] != i) {
            parent[i] = parent[parent[i]];
            i = parent[i];
        }
        return i;
    }

    private static void union(int[] parent, int a, int b) {
        int ra = find(parent, a);
        int rb = find(parent, b);
        if (ra != rb) {
            parent[Math.max(ra, rb)] = Math.min(ra, rb);
        }
    }
}
