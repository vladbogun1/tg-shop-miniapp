package com.maxsolch.shop.delivery.infra;

import com.maxsolch.shop.delivery.domain.NovaPoshtaCity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface NovaPoshtaCityRepository extends JpaRepository<NovaPoshtaCity, String> {

    /**
     * City search ranked the way a person expects. Names carry the region in brackets
     * ("Андріївка (Харківська обл., …)"), so a plain alphabetical "contains" put every village of the
     * Kharkiv region ahead of Kharkiv itself, and the 50-row cap then dropped the city entirely.
     * Order: exact name → name starts with the query → a word of the name (before the bracket)
     * contains it → only the bracketed region matches; inside each group, more Nova Poshta points
     * first (a proxy for size: Kyiv 8k, Kharkiv 1.8k, a village 1), then by name.
     *
     * Apostrophes are ignored on both sides: the directory writes «Ком'яти» with ', people type ’, ʼ or nothing.
     *
     * @param q lower-cased, trimmed query without apostrophes
     */
    @Query(value = """
            SELECT c.* FROM nova_poshta_cities c
            JOIN (SELECT ref, REPLACE(REPLACE(REPLACE(LOWER(name), '''', ''), '’', ''), 'ʼ', '') AS nm
                  FROM nova_poshta_cities) k ON k.ref = c.ref
            LEFT JOIN (SELECT city_ref, COUNT(*) AS n FROM nova_poshta_warehouses GROUP BY city_ref) w
                   ON w.city_ref = c.ref
            WHERE k.nm LIKE CONCAT('%', :q, '%')
            ORDER BY
              CASE
                WHEN SUBSTRING_INDEX(k.nm, ' (', 1) = :q THEN 0
                WHEN k.nm LIKE CONCAT(:q, '%') THEN 1
                WHEN SUBSTRING_INDEX(k.nm, ' (', 1) LIKE CONCAT('%', :q, '%') THEN 2
                ELSE 3
              END,
              COALESCE(w.n, 0) DESC,
              c.name
            LIMIT 50
            """, nativeQuery = true)
    List<NovaPoshtaCity> searchRanked(@Param("q") String q);

    List<NovaPoshtaCity> findTop50ByOrderByNameAsc();
}
