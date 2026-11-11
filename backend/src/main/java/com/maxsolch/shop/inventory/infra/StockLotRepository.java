package com.maxsolch.shop.inventory.infra;

import com.maxsolch.shop.inventory.domain.StockLot;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;

public interface StockLotRepository extends JpaRepository<StockLot, Long> {

    /** Lots of one product (variant) in {@link StockLot#SALE_ORDER}; {@code variantId} null = a product without variants. */
    default List<StockLot> findKey(byte[] productId, byte[] variantId) {
        List<StockLot> found = variantId == null ? findByProductIdAndVariantIdIsNullOrderByIdAsc(productId)
                : findByProductIdAndVariantIdOrderByIdAsc(productId, variantId);
        return found.stream().sorted(StockLot.SALE_ORDER).toList();
    }

    /** Lots of one product (all variants) in {@link StockLot#SALE_ORDER}. */
    default List<StockLot> findOfProduct(byte[] productId) {
        return findByProductIdOrderByIdAsc(productId).stream().sorted(StockLot.SALE_ORDER).toList();
    }

    List<StockLot> findByProductIdAndVariantIdIsNullOrderByIdAsc(byte[] productId);

    List<StockLot> findByProductIdAndVariantIdOrderByIdAsc(byte[] productId, byte[] variantId);

    List<StockLot> findByProductIdOrderByIdAsc(byte[] productId);

    List<StockLot> findByBatchItemIdIn(Collection<Long> batchItemIds);

    List<StockLot> findByQtyLeftGreaterThan(int qty);
}
