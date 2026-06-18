package com.maxsolch.shop.repository;

import com.maxsolch.shop.domain.ProductVariant;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ProductVariantRepository extends JpaRepository<ProductVariant, byte[]> {
}
