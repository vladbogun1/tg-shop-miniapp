package com.maxsolch.shop.repository;

import com.maxsolch.shop.domain.Product;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
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

    boolean existsBySlug(String slug);

    boolean existsBySlugAndIdNot(String slug, byte[] id);

    boolean existsBySku(String sku);

    boolean existsBySkuAndIdNot(String sku, byte[] id);

    /** Another product already has this article number ({@code id} null = a product being created). */
    default boolean skuTaken(String sku, byte[] id) {
        return id == null ? existsBySku(sku) : existsBySkuAndIdNot(sku, id);
    }

    /** Products directly in a category (any state), for the "category has products" checks. */
    @Query("select count(p) from Product p where p.categoryId = :categoryId")
    long countByCategory(@Param("categoryId") byte[] categoryId);

    /** {@code [categoryId, count]} of non-archived products ({@code activeOnly}: and active). */
    @Query("select p.categoryId, count(p) from Product p where p.archived = false "
            + "and (:activeOnly = false or p.active = true) and p.categoryId is not null group by p.categoryId")
    List<Object[]> countsByCategory(@Param("activeOnly") boolean activeOnly);

    /** {@code [id, categoryId, specsJson]} of every product that has characteristics. */
    @Query("select p.id, p.categoryId, p.specsJson from Product p where p.specsJson is not null")
    List<Object[]> specsRows();

    @Modifying(flushAutomatically = true)
    @Query("update Product p set p.specsJson = :json where p.id = :id")
    int updateSpecs(@Param("id") byte[] id, @Param("json") String json);

    /** {@code [brandId, count]} of non-archived products. */
    @Query("select p.brandId, count(p) from Product p where p.archived = false and p.brandId is not null "
            + "group by p.brandId")
    List<Object[]> countsByBrand();

    @Modifying(flushAutomatically = true)
    @Query("update Product p set p.categoryId = :to where p.categoryId = :from")
    int moveCategory(@Param("from") byte[] from, @Param("to") byte[] to);

    @Modifying(flushAutomatically = true)
    @Query("update Product p set p.brandId = :to where p.brandId = :from")
    int moveBrand(@Param("from") byte[] from, @Param("to") byte[] to);

    /** {@code [id, title]} of the given products (translated titles of customer order lines). */
    @Query("select p.id, p.title from Product p where p.id in :ids")
    List<Object[]> titlesByIds(@Param("ids") Collection<byte[]> ids);

    /**
     * {@code [id, title, description, seoTitle, seoDescription, active, archived, conditionNote]} of every
     * product — the Russian sources the content translations are checked against.
     */
    @Query("select p.id, p.title, p.description, p.seoTitle, p.seoDescription, p.active, p.archived, "
            + "p.conditionNote from Product p")
    List<Object[]> translationSources();
}
