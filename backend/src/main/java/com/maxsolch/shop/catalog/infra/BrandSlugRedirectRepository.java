package com.maxsolch.shop.catalog.infra;

import com.maxsolch.shop.catalog.domain.BrandSlugRedirect;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;

public interface BrandSlugRedirectRepository extends JpaRepository<BrandSlugRedirect, String> {

    /**
     * {@code [old_slug, current slug]} for the given old slugs. A slug that some brand wears again
     * is not a redirect any more: the live brand wins.
     */
    @Query(nativeQuery = true, value = "SELECT r.old_slug, b.slug FROM brand_slug_redirects r "
            + "JOIN brands b ON b.id = r.brand_id WHERE r.old_slug IN (:slugs) "
            + "AND NOT EXISTS (SELECT 1 FROM brands x WHERE x.slug = r.old_slug)")
    List<Object[]> resolve(@Param("slugs") Collection<String> slugs);

    /** Merge: the old slugs of the absorbed brand now point at the target. */
    @Modifying
    @Query(nativeQuery = true, value = "UPDATE brand_slug_redirects SET brand_id = :target WHERE brand_id = :source")
    int repoint(@Param("source") byte[] source, @Param("target") byte[] target);
}
