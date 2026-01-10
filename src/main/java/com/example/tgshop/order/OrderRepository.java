package com.example.tgshop.order;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import org.springframework.data.jpa.repository.Query;

public interface OrderRepository extends JpaRepository<OrderEntity, byte[]> {

  @Query("select distinct o from OrderEntity o left join fetch o.items order by o.createdAt desc")
  List<OrderEntity> findAllWithItems();
}
