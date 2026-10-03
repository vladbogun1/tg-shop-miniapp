package com.maxsolch.shop.repository;

import com.maxsolch.shop.domain.ProductVariant;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;

public interface ProductVariantRepository extends JpaRepository<ProductVariant, byte[]> {

    /** {@code [id, name]} of the given variants (translated names of customer order lines). */
    @Query("select v.id, v.name from ProductVariant v where v.id in :ids")
    List<Object[]> namesByIds(@Param("ids") Collection<byte[]> ids);

    /** {@code [id, name, productActive, productArchived]} of every variant — translation sources. */
    @Query("select v.id, v.name, p.active, p.archived from ProductVariant v join v.product p")
    List<Object[]> translationSources();
}
