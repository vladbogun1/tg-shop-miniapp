package com.maxsolch.shop.catalog;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface BrandRepository extends JpaRepository<Brand, byte[]> {

    Optional<Brand> findByName(String name);

    Optional<Brand> findBySlug(String slug);

    boolean existsBySlug(String slug);

    boolean existsBySlugAndIdNot(String slug, byte[] id);
}
