package com.maxsolch.shop.repository;

import com.maxsolch.shop.domain.OrderItem;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface OrderItemRepository extends JpaRepository<OrderItem, Long> {

    /**
     * Units sold per product, excluding cancelled orders — drives the catalog's "popular first"
     * sort, which shipped as a hardcoded zero and therefore never actually sorted by anything.
     */
    @Query("select it.productId, sum(it.quantity) from OrderItem it "
            + "where it.order.status <> com.maxsolch.shop.domain.OrderStatus.REJECTED "
            + "and it.gift = false "
            + "group by it.productId")
    List<Object[]> soldCountsByProduct();

    /** Item counts for a set of orders, so order cards do not each trigger a lazy collection load. */
    @Query("select it.order.id, sum(it.quantity) from OrderItem it "
            + "where it.order.id in :orderIds group by it.order.id")
    List<Object[]> itemCountsByOrder(@Param("orderIds") List<byte[]> orderIds);
}
