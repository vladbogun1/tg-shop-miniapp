package com.maxsolch.shop.repository;

import com.maxsolch.shop.domain.ProductImage;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface ProductImageRepository extends JpaRepository<ProductImage, Long> {

    /**
     * All images of several products at once, ordered so the caller can keep the first per product.
     * Order detail used to run one thumbnail query per line item.
     */
    @Query("select pi from ProductImage pi where pi.product.id in :productIds "
            + "order by pi.sortOrder asc, pi.id asc")
    List<ProductImage> findForProducts(@Param("productIds") List<byte[]> productIds);
}
