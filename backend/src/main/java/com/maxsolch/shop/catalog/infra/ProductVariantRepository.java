package com.maxsolch.shop.catalog.infra;

import com.maxsolch.shop.catalog.domain.ProductVariant;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;

public interface ProductVariantRepository extends JpaRepository<ProductVariant, byte[]> {

    /** {@code [id, name]} of the given variants (translated names of customer order lines). */
    @Query("select v.id, v.name from ProductVariant v where v.id in :ids")
    List<Object[]> namesByIds(@Param("ids") Collection<byte[]> ids);

    /**
     * {@code [id, name, productActive, productArchived, productId, productTitle]} of every variant —
     * translation sources (the product is the context shown in the translation screen).
     */
    @Query("select v.id, v.name, p.active, p.archived, p.id, p.title from ProductVariant v join v.product p")
    List<Object[]> translationSources();

    /** Of these ids, the ones that still exist (the translation sweep asks which rows lost their entity). */
    @org.springframework.data.jpa.repository.Query("select e.id from ProductVariant e where e.id in :ids")
    java.util.List<byte[]> existingIds(@org.springframework.data.repository.query.Param("ids") java.util.Collection<byte[]> ids);
}
