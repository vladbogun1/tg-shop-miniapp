package com.example.tgshop.order;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface OrderItemRepository extends JpaRepository<OrderItem, Long> {

  @Query("select i.productId as productId, sum(i.quantity) as sold from OrderItem i group by i.productId")
  List<SoldCountRow> findSoldCounts();

  @Query("select coalesce(sum(i.quantity), 0) from OrderItem i where i.productId = :productId")
  long sumSoldByProductId(@Param("productId") byte[] productId);

  interface SoldCountRow {
    byte[] getProductId();

    Long getSold();
  }
}
