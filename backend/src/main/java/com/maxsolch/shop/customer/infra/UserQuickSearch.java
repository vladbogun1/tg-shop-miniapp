package com.maxsolch.shop.customer.infra;

import com.maxsolch.shop.customer.domain.User;
import jakarta.persistence.EntityManager;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Locale;

/** The few best customer matches for the admin's «go to» box: username, first or last name, full name. */
@Repository
public class UserQuickSearch {

    private final EntityManager em;

    public UserQuickSearch(EntityManager em) {
        this.em = em;
    }

    /**
     * Most recently seen first. {@code term} is plain text (a leading «@» is dropped, usernames are stored without it);
     * LIKE wildcards in it are escaped here.
     */
    public List<User> find(String term, int limit) {
        String t = term.trim();
        if (t.startsWith("@")) {
            t = t.substring(1);
        }
        t = t.trim().toLowerCase(Locale.ROOT);
        if (t.isEmpty()) {
            return List.of();
        }
        String like = "%" + t.replace("!", "!!").replace("%", "!%").replace("_", "!_") + "%";
        return em.createQuery("select u from User u where lower(coalesce(u.username, '')) like :like escape '!' "
                        + "or lower(coalesce(u.firstName, '')) like :like escape '!' "
                        + "or lower(coalesce(u.lastName, '')) like :like escape '!' "
                        + "or lower(concat(coalesce(u.firstName, ''), ' ', coalesce(u.lastName, ''))) like :like escape '!' "
                        + "order by u.lastSeenAt desc, u.telegramUserId desc", User.class)
                .setParameter("like", like)
                .setMaxResults(limit)
                .getResultList();
    }
}
