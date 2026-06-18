package com.maxsolch.shop.repository;

import com.maxsolch.shop.domain.Product;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface ProductRepository extends JpaRepository<Product, byte[]> {

    /**
     * Collections (images/variants/tags) are loaded lazily and batch-fetched
     * (hibernate.default_batch_fetch_size) within the read-only transaction in the
     * service. We intentionally avoid a multi-collection join fetch / entity graph
     * here because two List collections would trigger Hibernate's MultipleBagFetchException.
     */
    @Query("select p from Product p where p.active = true and p.archived = false order by p.createdAt desc")
    List<Product> findAllActive();

    @Query("select p from Product p where p.id = :id")
    Optional<Product> findByIdWithDetails(@Param("id") byte[] id);

    @Query("select p from Product p where p.archived = false order by p.createdAt desc")
    List<Product> findAllNotArchived();

    @Query("select p from Product p where p.archived = true order by p.createdAt desc")
    List<Product> findAllArchived();

    boolean existsByTitle(String title);
}
