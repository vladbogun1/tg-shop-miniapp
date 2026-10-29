package com.maxsolch.shop.inventory.infra;

import com.maxsolch.shop.inventory.domain.StockLot;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;

public interface StockLotRepository extends JpaRepository<StockLot, Long> {

    /** Lots of one product (variant), oldest first; {@code variantId} null = a product without variants. */
    default List<StockLot> findKey(byte[] productId, byte[] variantId) {
        return variantId == null ? findByProductIdAndVariantIdIsNullOrderByIdAsc(productId)
                : findByProductIdAndVariantIdOrderByIdAsc(productId, variantId);
    }

    List<StockLot> findByProductIdAndVariantIdIsNullOrderByIdAsc(byte[] productId);

    List<StockLot> findByProductIdAndVariantIdOrderByIdAsc(byte[] productId, byte[] variantId);

    List<StockLot> findByProductIdOrderByIdAsc(byte[] productId);

    List<StockLot> findByBatchItemIdIn(Collection<Long> batchItemIds);

    List<StockLot> findByQtyLeftGreaterThan(int qty);
}
