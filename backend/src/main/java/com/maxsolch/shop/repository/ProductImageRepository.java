package com.maxsolch.shop.repository;

import com.maxsolch.shop.domain.ProductImage;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface ProductImageRepository extends JpaRepository<ProductImage, Long> {

    /** First image (by sort order) of a product — for order-item thumbnails. */
    Optional<ProductImage> findFirstByProduct_IdOrderBySortOrderAscIdAsc(byte[] productId);
}
