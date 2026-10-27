package com.maxsolch.shop.preorder;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;

public interface PreorderBatchItemRepository extends JpaRepository<PreorderBatchItem, Long> {

    List<PreorderBatchItem> findByBatchIdOrderByIdAsc(Long batchId);

    List<PreorderBatchItem> findByBatchIdIn(Collection<Long> batchIds);

    /**
     * Lines of batches customers can see: still on the way and with the pre-order open. Each row is
     * {@code [PreorderBatchItem, PreorderBatch]}.
     */
    @Query("select i, b from PreorderBatchItem i, PreorderBatch b where b.id = i.batchId "
            + "and b.preorderOpen = true and b.status in ('ORDERED', 'IN_TRANSIT', 'CUSTOMS')")
    List<Object[]> findPublicLines();

    /** The same, for one product. */
    @Query("select i, b from PreorderBatchItem i, PreorderBatch b where b.id = i.batchId "
            + "and b.preorderOpen = true and b.status in ('ORDERED', 'IN_TRANSIT', 'CUSTOMS') "
            + "and i.productId = :productId")
    List<Object[]> findPublicLines(@Param("productId") byte[] productId);
}
