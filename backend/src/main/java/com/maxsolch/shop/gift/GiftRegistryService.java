package com.maxsolch.shop.gift;

import com.maxsolch.shop.platform.util.UuidUtil;
import com.maxsolch.shop.order.domain.Order;
import com.maxsolch.shop.gift.GiftDtos.GiftRegistryDto;
import com.maxsolch.shop.gift.GiftDtos.GiftRegistryRowDto;
import com.maxsolch.shop.platform.settings.SettingsRegistry;
import com.maxsolch.shop.platform.settings.SettingsService;
import com.maxsolch.shop.platform.error.BadRequestException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

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

    static final ZoneId ZONE = ZoneId.of("Europe/Kyiv");

    /** How far back undelivered gifts are still looked at (an order older than this is long settled). */
    static final Duration LOOKBACK = Duration.ofDays(120);

    private final JdbcTemplate jdbc;
    private final SettingsService settings;

    public GiftRegistryService(JdbcTemplate jdbc, SettingsService settings) {
        this.jdbc = jdbc;
        this.settings = settings;
    }

    /** Who received a gift: the keys an order carries. */
    public record Person(Long userId, Long tgUserId, String phoneKey) {

        public static Person of(Order o) {
            return new Person(o.getUserId(), o.getTgUserId(), GiftRegistryService.phoneKey(o.getPhone()));
        }
    }

    /** Last 9 digits of a phone (+380 67…, 067…, 67… are the same number); null when too short. */
    public static String phoneKey(String phone) {
        if (phone == null) {
            return null;
        }
        String digits = phone.replaceAll("\\D", "");
        return digits.length() < 9 ? null : digits.substring(digits.length() - 9);
    }

    /** One gift line as the registry sees it. */
    public record Line(String orderId, Instant createdAt, Instant deliveredAt, String status, String customerName,
                       String phone, String tgUsername, Person person, String title, String variant, int quantity,
                       long unitMinor, String source, String tier) {

        public long valueMinor() {
            return unitMinor * quantity;
        }

        /** When the gift was handed over: delivered, or (not yet) the order date. */
        public Instant date() {
            return deliveredAt != null ? deliveredAt : createdAt;
        }

        public YearMonth month() {
            return YearMonth.from(date().atZone(ZONE));
        }
    }

    public static final String SOURCE_CASE = "CASE";
    public static final String SOURCE_THRESHOLD = "THRESHOLD";
    public static final String SOURCE_ADMIN = "ADMIN";

    /** The monthly limit per person, kopecks; 0 = no limit. */
    public long limitMinor() {
        return Math.max(0, settings.getInt(SettingsRegistry.GIFT_MONTHLY_LIMIT_UAH)) * 100L;
    }

    /**
     * How much more a person may be given this month, kopecks: the limit minus their gifts delivered
     * this month and not delivered yet. {@link Long#MAX_VALUE} when there is no limit.
     */
    @Transactional(readOnly = true)
    public long remainingMinor(Person person, Instant now) {
        long limit = limitMinor();
        if (limit <= 0) {
            return Long.MAX_VALUE;
        }
        YearMonth month = YearMonth.from(now.atZone(ZONE));
        Instant since = month.atDay(1).atStartOfDay(ZONE).toInstant().minus(LOOKBACK);
        long used = usedMinor(person, lines(since), month);
        return Math.max(0, limit - used);
    }

    /**
     * The limit as an admin giving a gift to an order sees it: the order's person, this month. Their
     * gifts already in this order count too. Empty when the order does not exist.
     */
    @Transactional(readOnly = true)
    public java.util.Optional<GiftDtos.GiftLimitDto> limitForOrder(byte[] orderId, Instant now) {
        List<Person> found = jdbc.query("select user_id, tg_user_id, phone from orders where id = ?",
                (rs, n) -> new Person(nullableLong(rs, "user_id"), nullableLong(rs, "tg_user_id"),
                        phoneKey(rs.getString("phone"))), (Object) orderId);
        if (found.isEmpty()) {
            return java.util.Optional.empty();
        }
        YearMonth month = YearMonth.from(now.atZone(ZONE));
        Instant since = month.atDay(1).atStartOfDay(ZONE).toInstant().minus(LOOKBACK);
        long used = usedMinor(found.get(0), lines(since), month);
        long limit = limitMinor();
        return java.util.Optional.of(new GiftDtos.GiftLimitDto(month.toString(), limit, used,
                limit > 0 ? Math.max(0, limit - used) : -1));
    }

    /** The person's gifts (with everyone joined to them) delivered in {@code month} or not delivered yet. */
    static long usedMinor(Person person, List<Line> lines, YearMonth month) {
        List<Line> all = new ArrayList<>(lines);
        int[] group = groups(all.stream().map(Line::person).toList(), person);
        long used = 0;
        for (int i = 0; i < all.size(); i++) {
            Line l = all.get(i);
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
            throw new BadRequestException("Неверный период");
        }
        if (Duration.between(from.atStartOfDay(), to.atStartOfDay()).toDays() > 400) {
            throw new BadRequestException("Период — не больше года");
        }
        Instant start = from.atStartOfDay(ZONE).toInstant();
        Instant end = to.plusDays(1).atStartOfDay(ZONE).toInstant();
        // Whole months around the span, so a month total also counts gifts outside the shown dates.
        Instant since = YearMonth.from(from).atDay(1).atStartOfDay(ZONE).toInstant().minus(LOOKBACK);
        List<Line> lines = lines(since);
        int[] group = groups(lines.stream().map(Line::person).toList(), null);

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
            Line l = lines.get(i);
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

    /** Gift lines of not rejected orders created since {@code since}, units returned left out. */
    List<Line> lines(Instant since) {
        return jdbc.query("""
                select o.id, o.created_at, o.delivered_at, o.status, o.customer_name, o.phone, o.tg_username,
                       o.user_id, o.tg_user_id, o.gift_tier,
                       i.title_snapshot, i.variant_name_snapshot, i.quantity - i.returned_qty qty,
                       case when i.gift_value_minor > 0 then i.gift_value_minor else coalesce(p.price_minor, 0) end unit,
                       i.auto_gift, i.case_rarity
                  from order_items i
                  join orders o on o.id = i.order_id
                  left join products p on p.id = i.product_id
                 where i.gift = 1 and o.status <> 'REJECTED' and o.created_at >= ?
                   and i.quantity - i.returned_qty > 0
                 order by o.created_at, i.id
                """, (rs, n) -> {
            String phone = rs.getString("phone");
            Timestamp delivered = rs.getTimestamp("delivered_at");
            boolean isCase = rs.getString("case_rarity") != null;
            String source = isCase ? SOURCE_CASE : rs.getBoolean("auto_gift") ? SOURCE_THRESHOLD : SOURCE_ADMIN;
            return new Line(UuidUtil.toString(rs.getBytes("id")), rs.getTimestamp("created_at").toInstant(),
                    delivered == null ? null : delivered.toInstant(), rs.getString("status"),
                    rs.getString("customer_name"), phone, rs.getString("tg_username"),
                    new Person(nullableLong(rs, "user_id"), nullableLong(rs, "tg_user_id"), phoneKey(phone)),
                    rs.getString("title_snapshot"), rs.getString("variant_name_snapshot"), rs.getInt("qty"),
                    rs.getLong("unit"), source, isCase ? rs.getString("gift_tier") : null);
        }, Timestamp.from(since));
    }

    private static Long nullableLong(java.sql.ResultSet rs, String col) throws java.sql.SQLException {
        long v = rs.getLong(col);
        return rs.wasNull() ? null : v;
    }

    /**
     * Joins people that share any key (union–find). With {@code extra} non-null it takes the index
     * {@code people.size()}, so the caller can ask which lines belong to it.
     */
    static int[] groups(List<Person> people, Person extra) {
        List<Person> all = new ArrayList<>(people);
        if (extra != null) {
            all.add(extra);
        }
        int[] parent = new int[all.size()];
        for (int i = 0; i < parent.length; i++) {
            parent[i] = i;
        }
        Map<String, Integer> firstByKey = new HashMap<>();
        for (int i = 0; i < all.size(); i++) {
            Person p = all.get(i);
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
