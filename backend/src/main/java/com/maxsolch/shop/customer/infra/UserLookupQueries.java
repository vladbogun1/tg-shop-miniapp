package com.maxsolch.shop.customer.infra;

import jakarta.persistence.EntityManager;
import jakarta.persistence.Query;
import org.springframework.stereotype.Repository;

import java.util.Collection;
import java.util.List;

/** Reads of {@code users} for other modules' feeds: names by id and users matching a name search. */
@Repository
public class UserLookupQueries {

    /** First name, last name and username of one user. */
    public record Names(long telegramUserId, String firstName, String lastName, String username) {
    }

    private final EntityManager em;

    public UserLookupQueries(EntityManager em) {
        this.em = em;
    }

    public List<Names> namesOf(Collection<Long> ids) {
        if (ids.isEmpty()) {
            return List.of();
        }
        Query q = em.createNativeQuery("SELECT telegram_user_id, first_name, last_name, username FROM users "
                + "WHERE telegram_user_id IN (:ids)");
        q.setParameter("ids", ids);
        @SuppressWarnings("unchecked")
        List<Object[]> rows = q.getResultList();
        return rows.stream().map(r -> new Names(((Number) r[0]).longValue(), (String) r[1], (String) r[2],
                (String) r[3])).toList();
    }

    /** Users whose username, first or last name matches the LIKE pattern (MySQL default escape: backslash). */
    public List<Long> matchingName(String like) {
        Query q = em.createNativeQuery("SELECT telegram_user_id FROM users WHERE username LIKE :like "
                + "OR first_name LIKE :like OR last_name LIKE :like");
        q.setParameter("like", like);
        @SuppressWarnings("unchecked")
        List<Object> ids = q.getResultList();
        return ids.stream().map(o -> ((Number) o).longValue()).toList();
    }
}
