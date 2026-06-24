package com.maxsolch.shop.service;

import com.maxsolch.shop.web.dto.UserCardDto;
import com.maxsolch.shop.web.dto.UserMetricsDto;
import com.maxsolch.shop.repository.UserRepository;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import jakarta.persistence.Query;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

/** Admin-facing user list + user analytics. */
@Service
public class UserAdminService {

    private static final String CURRENCY = "UAH";
    private static final DateTimeFormatter DAY = DateTimeFormatter.ofPattern("yyyy-MM-dd").withZone(ZoneOffset.UTC);

    /**
     * Whitelisted sort columns → SQL. Entity columns AND the two computed aliases
     * (ordersCount / totalSpentMinor) — MySQL can ORDER BY a SELECT alias.
     */
    private static final Map<String, String> SORT_SQL = Map.of(
            "createdAt", "u.created_at",
            "lastSeenAt", "u.last_seen_at",
            "username", "u.username",
            "telegramUserId", "u.telegram_user_id",
            "ordersCount", "ordersCount",
            "totalSpentMinor", "totalSpentMinor");

    @PersistenceContext
    private EntityManager em;

    private final UserRepository userRepository;

    public UserAdminService(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    @Transactional(readOnly = true)
    public List<UserCardDto> list(String q, boolean blockedOnly, int page, int size, String sortBy, String sortDir) {
        boolean hasQ = q != null && !q.isBlank();
        String like = hasQ ? "%" + q.trim().toLowerCase() + "%" : "";
        String col = SORT_SQL.getOrDefault(sortBy, "u.created_at");
        String dir = "asc".equalsIgnoreCase(sortDir) ? "ASC" : "DESC";
        int sz = Math.max(1, Math.min(size, 100));
        int off = Math.max(0, page) * sz;

        String sql = "SELECT u.telegram_user_id, u.username, u.first_name, u.last_name, "
                + "u.language_code, u.is_premium, u.bot_blocked, "
                + "(SELECT COUNT(*) FROM orders o WHERE o.tg_user_id = u.telegram_user_id) AS ordersCount, "
                + "(SELECT COALESCE(SUM(o.total_minor), 0) FROM orders o "
                + "   WHERE o.tg_user_id = u.telegram_user_id AND o.status <> 'REJECTED') AS totalSpentMinor, "
                + "u.created_at, u.last_seen_at "
                + "FROM users u "
                + "WHERE (:hasQ = FALSE OR ("
                + "   LOWER(COALESCE(u.username, '')) LIKE :like "
                + "   OR LOWER(COALESCE(u.first_name, '')) LIKE :like "
                + "   OR LOWER(COALESCE(u.last_name, '')) LIKE :like "
                + "   OR CAST(u.telegram_user_id AS CHAR) LIKE :like)) "
                + "AND (:blockedOnly = FALSE OR u.bot_blocked = TRUE) "
                + "ORDER BY " + col + " " + dir + ", u.telegram_user_id DESC "
                + "LIMIT :lim OFFSET :off";

        Query query = em.createNativeQuery(sql);
        query.setParameter("hasQ", hasQ);
        query.setParameter("like", like);
        query.setParameter("blockedOnly", blockedOnly);
        query.setParameter("lim", sz);
        query.setParameter("off", off);

        @SuppressWarnings("unchecked")
        List<Object[]> rows = query.getResultList();
        return rows.stream().map(UserAdminService::toCard).toList();
    }

    private static UserCardDto toCard(Object[] r) {
        return new UserCardDto(
                asLong(r[0]),
                asString(r[1]),
                asString(r[2]),
                asString(r[3]),
                asString(r[4]),
                asBool(r[5]),
                asBool(r[6]),
                asLong(r[7]),
                asLong(r[8]),
                asInstant(r[9]),
                asInstant(r[10]));
    }

    private static long asLong(Object o) {
        return o == null ? 0L : ((Number) o).longValue();
    }

    private static String asString(Object o) {
        return o == null ? null : o.toString();
    }

    private static boolean asBool(Object o) {
        if (o instanceof Boolean b) return b;
        return o != null && ((Number) o).intValue() != 0;
    }

    private static Instant asInstant(Object o) {
        if (o == null) return null;
        if (o instanceof Timestamp ts) return ts.toInstant();
        if (o instanceof Instant i) return i;
        if (o instanceof LocalDateTime ldt) return ldt.toInstant(ZoneOffset.UTC);
        return null;
    }

    @Transactional(readOnly = true)
    public UserMetricsDto metrics(TimeRange range) {
        long total = userRepository.count();
        long blocked = userRepository.countByBotBlockedTrue();
        long premium = userRepository.countByPremiumTrue();
        long active = userRepository.countUsersWithOrders();
        long inactive = Math.max(0, total - active);

        Instant from = range.from();
        List<Instant> created = userRepository.createdAtsSince(from);
        long newInRange = created.size();

        Map<String, Long> byDay = new TreeMap<>();
        for (Instant ts : created) {
            if (ts == null) continue;
            byDay.merge(DAY.format(ts), 1L, Long::sum);
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

        List<UserMetricsDto.TopCustomer> topCustomers = userRepository.topCustomers(PageRequest.of(0, 10)).stream()
                .map(r -> new UserMetricsDto.TopCustomer(
                        ((Number) r[0]).longValue(),
                        r[1] == null ? "—" : r[1].toString(),
                        ((Number) r[2]).longValue(),
                        ((Number) r[3]).longValue()))
                .toList();

        return new UserMetricsDto(range.name().toLowerCase(), CURRENCY, total, newInRange,
                active, inactive, blocked, premium, newUsersByDay, languages, topCustomers);
    }
}
