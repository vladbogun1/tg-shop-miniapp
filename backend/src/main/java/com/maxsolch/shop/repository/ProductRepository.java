package com.maxsolch.shop.repository;

import com.maxsolch.shop.domain.Product;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
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

    /**
     * Same lookup, but takes a row lock (SELECT ... FOR UPDATE) on the product.
     *
     * <p>Stock is read, checked and written back as separate statements, so without a lock two
     * concurrent checkouts both see "1 left" and both succeed — the shop oversells. The product row
     * is the aggregate root for its variants, so locking it serialises every stock change for that
     * product (and its variants) without needing a lock per variant.
     *
     * <p>Callers MUST take these locks in a stable order (sorted by product id) to avoid deadlocks
     * between two orders touching the same pair of products.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select p from Product p where p.id = :id")
    Optional<Product> findByIdForUpdate(@Param("id") byte[] id);

    @Query("select p from Product p where p.archived = false order by p.createdAt desc")
    List<Product> findAllNotArchived();

    @Query("select p from Product p where p.archived = true order by p.createdAt desc")
    List<Product> findAllArchived();

    boolean existsByTitle(String title);
}
