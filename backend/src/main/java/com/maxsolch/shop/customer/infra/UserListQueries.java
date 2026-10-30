package com.maxsolch.shop.customer.infra;

import jakarta.persistence.EntityManager;
import jakarta.persistence.Query;
import org.springframework.stereotype.Repository;

import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Map;

/**
 * The admin users list over the {@code users} table only: search, «blocked only», sort by a user column, one page. What the
 * customers ordered is not here — {@code customer.app.OrderHistory} asks the owner of {@code orders}.
 */
@Repository
public class UserListQueries {

    /** A sort column of the users table (a whitelist: the SQL fragment never comes from the request). */
    public enum Column {
        CREATED_AT("u.created_at"), LAST_SEEN_AT("u.last_seen_at"), USERNAME("u.username"),
        TELEGRAM_USER_ID("u.telegram_user_id");

        private final String sql;

        Column(String sql) {
            this.sql = sql;
        }
    }

    /** One row of the list: the user's columns. */
    public record UserRow(long telegramUserId, String username, String firstName, String lastName, String languageCode,
                          boolean premium, boolean botBlocked, Instant createdAt, Instant lastSeenAt, String locale) {
    }

    private static final String SELECT = "SELECT u.telegram_user_id, u.username, u.first_name, u.last_name, "
            + "u.language_code, u.is_premium, u.bot_blocked, u.created_at, u.last_seen_at, u.locale FROM users u ";
    private static final String FILTER = "WHERE (:hasQ = FALSE OR ("
            + "   LOWER(COALESCE(u.username, '')) LIKE :like "
            + "   OR LOWER(COALESCE(u.first_name, '')) LIKE :like "
            + "   OR LOWER(COALESCE(u.last_name, '')) LIKE :like "
            + "   OR CAST(u.telegram_user_id AS CHAR) LIKE :like)) "
            + "AND (:blockedOnly = FALSE OR u.bot_blocked = TRUE) ";

    private final EntityManager em;

    public UserListQueries(EntityManager em) {
        this.em = em;
    }

    /** One page ordered by a user column (ties: the newest Telegram id first). */
    public List<UserRow> page(boolean hasQ, String like, boolean blockedOnly, Column by, boolean ascending, int limit,
                              int offset) {
        Query query = em.createNativeQuery(SELECT + FILTER + "ORDER BY " + by.sql + " " + (ascending ? "ASC" : "DESC")
                + ", u.telegram_user_id DESC LIMIT :lim OFFSET :off");
        filter(query, hasQ, like, blockedOnly);
        query.setParameter("lim", limit);
        query.setParameter("off", offset);
        return rows(query);
    }

    /** Telegram ids of everyone the filter matches (to sort by something the users table does not have). */
    public List<Long> matchingIds(boolean hasQ, String like, boolean blockedOnly) {
        Query query = em.createNativeQuery("SELECT u.telegram_user_id FROM users u " + FILTER);
        filter(query, hasQ, like, blockedOnly);
        @SuppressWarnings("unchecked")
        List<Object> ids = query.getResultList();
        return ids.stream().map(o -> ((Number) o).longValue()).toList();
    }

    /** The rows of these users, in the order of {@code ids}. */
    public List<UserRow> byIds(List<Long> ids) {
        if (ids.isEmpty()) {
            return List.of();
        }
        Query query = em.createNativeQuery(SELECT + "WHERE u.telegram_user_id IN (:ids)");
        query.setParameter("ids", ids);
        Map<Long, UserRow> byId = new java.util.HashMap<>();
        rows(query).forEach(r -> byId.put(r.telegramUserId(), r));
        Collection<UserRow> ordered = new ArrayList<>();
        ids.forEach(id -> {
            if (byId.containsKey(id)) {
                ordered.add(byId.get(id));
            }
        });
        return List.copyOf(ordered);
    }

    private static void filter(Query query, boolean hasQ, String like, boolean blockedOnly) {
        query.setParameter("hasQ", hasQ);
        query.setParameter("like", like);
        query.setParameter("blockedOnly", blockedOnly);
    }

    private static List<UserRow> rows(Query query) {
        @SuppressWarnings("unchecked")
        List<Object[]> rows = query.getResultList();
        return rows.stream().map(r -> new UserRow(asLong(r[0]), asString(r[1]), asString(r[2]), asString(r[3]),
                asString(r[4]), asBool(r[5]), asBool(r[6]), asInstant(r[7]), asInstant(r[8]), asString(r[9]))).toList();
    }

    private static long asLong(Object o) {
        return o == null ? 0L : ((Number) o).longValue();
    }

    private static String asString(Object o) {
        return o == null ? null : o.toString();
    }

    private static boolean asBool(Object o) {
        if (o instanceof Boolean b) {
            return b;
        }
        return o != null && ((Number) o).intValue() != 0;
    }

    private static Instant asInstant(Object o) {
        if (o == null) {
            return null;
        }
        if (o instanceof Timestamp ts) {
            return ts.toInstant();
        }
        if (o instanceof Instant i) {
            return i;
        }
        if (o instanceof LocalDateTime ldt) {
            return ldt.toInstant(ZoneOffset.UTC);
        }
        return null;
    }
}
