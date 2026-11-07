package com.maxsolch.shop.order.infra;

import com.maxsolch.shop.order.domain.Order;
import jakarta.persistence.EntityManager;
import jakarta.persistence.TypedQuery;
import org.springframework.stereotype.Repository;

import java.util.ArrayList;
import java.util.List;

/**
 * The few best matches for the admin's «go to» box: an order by its number, the customer's name or phone (the phone
 * is stored as typed, so it is compared without spaces, dashes and brackets). Newest first; no paging, no totals.
 */
@Repository
public class OrderQuickSearch {

    /** Fewer digits than this match half of the phones. */
    static final int MIN_PHONE_DIGITS = 3;

    private static final String PLAIN_PHONE =
            "replace(replace(replace(replace(replace(o.phone, ' ', ''), '-', ''), '(', ''), ')', ''), '+', '')";

    private final EntityManager em;

    public OrderQuickSearch(EntityManager em) {
        this.em = em;
    }

    /** What the term looks like as a phone: only digits and phone punctuation, at least three digits; else null. */
    static String phoneDigits(String q) {
        if (q == null || !q.matches("[0-9 +()\\-]+")) {
            return null;
        }
        String digits = q.replaceAll("\\D", "");
        return digits.length() < MIN_PHONE_DIGITS ? null : digits;
    }

    public List<Order> orders(String q, int limit) {
        OrderSearchTerm term = OrderSearchTerm.parse(q);
        if (term.like() == null) {
            return List.of();
        }
        String digits = phoneDigits(q);
        List<String> any = new ArrayList<>();
        any.add("lower(o.customerName) like :like escape '!'");
        any.add("lower(o.phone) like :like escape '!'");
        if (term.idLo() != null) {
            any.add("o.id between :idLo and :idHi");
        }
        if (digits != null) {
            any.add(PLAIN_PHONE + " like :digits");
        }
        TypedQuery<Order> query = em.createQuery("select o from Order o where " + String.join(" or ", any)
                + " order by o.createdAt desc", Order.class);
        query.setParameter("like", term.like());
        if (term.idLo() != null) {
            query.setParameter("idLo", term.idLo());
            query.setParameter("idHi", term.idHi());
        }
        if (digits != null) {
            query.setParameter("digits", "%" + digits + "%");
        }
        return query.setMaxResults(limit).getResultList();
    }

    /** Buyers with a Telegram id whose order carries this phone, newest orders first (one row per order). */
    public List<Object[]> buyersByPhone(String q, int rows) {
        String digits = phoneDigits(q);
        if (digits == null) {
            return List.of();
        }
        TypedQuery<Object[]> query = em.createQuery("select o.tgUserId, o.customerName, o.phone from Order o "
                + "where o.tgUserId is not null and " + PLAIN_PHONE + " like :digits order by o.createdAt desc",
                Object[].class);
        query.setParameter("digits", "%" + digits + "%");
        return query.setMaxResults(rows).getResultList();
    }
}
