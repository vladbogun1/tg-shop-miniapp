package com.maxsolch.shop.catalog.infra;

import com.maxsolch.shop.catalog.domain.Product;
import jakarta.persistence.EntityManager;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Locale;

/** The few best product matches for the admin's «go to» box: by title or article number, not archived. */
@Repository
public class ProductQuickSearch {

    private final EntityManager em;

    public ProductQuickSearch(EntityManager em) {
        this.em = em;
    }

    /** Shown products first, then the newest. {@code term} is plain text: LIKE wildcards in it are escaped here. */
    public List<Product> find(String term, int limit) {
        String escaped = term.trim().toLowerCase(Locale.ROOT).replace("!", "!!").replace("%", "!%").replace("_", "!_");
        return em.createQuery("select p from Product p where p.archived = false "
                        + "and (lower(p.title) like :like escape '!' or lower(coalesce(p.sku, '')) like :like escape '!') "
                        + "order by p.active desc, p.createdAt desc", Product.class)
                .setParameter("like", "%" + escaped + "%")
                .setMaxResults(limit)
                .getResultList();
    }
}
