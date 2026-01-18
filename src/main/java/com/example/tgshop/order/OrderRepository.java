package com.example.tgshop.order;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.Query;

public interface OrderRepository extends JpaRepository<OrderEntity, byte[]> {

  @Query("select distinct o from OrderEntity o left join fetch o.items order by o.createdAt desc")
  List<OrderEntity> findAllWithItems();

  Optional<OrderEntity> findByAdminChatIdAndAdminThreadId(Long adminChatId, Integer adminThreadId);
}
