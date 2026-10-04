package com.maxsolch.shop.repository;

import com.maxsolch.shop.domain.OrderItem;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;

public interface OrderItemRepository extends JpaRepository<OrderItem, Long> {

    /**
     * Best sellers in a range: {@code [title, totalQty, revenueMinor]}, ordered by quantity. Grouped by
     * product id (a renamed product used to split into two rows) with its current title, and without
     * rejected orders or gift lines (a cancelled order must not lift a product). Revenue is at the
     * line price, before the order's promo discount.
     */
    @Query("select coalesce(max(p.title), max(it.titleSnapshot)), sum(it.quantity), "
            + "sum(it.quantity * it.priceMinorSnapshot) "
            + "from OrderItem it left join Product p on p.id = it.productId "
            + "where (:from is null or it.order.createdAt >= :from) "
            + "and it.order.status <> com.maxsolch.shop.domain.OrderStatus.REJECTED "
            + "and it.gift = false "
            + "group by it.productId "
            + "order by sum(it.quantity) desc")
    List<Object[]> topProducts(@Param("from") Instant from, Pageable pageable);

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
