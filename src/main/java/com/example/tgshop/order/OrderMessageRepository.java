package com.example.tgshop.order;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface OrderMessageRepository extends JpaRepository<OrderMessageEntity, Long> {
  List<OrderMessageEntity> findByOrderIdOrderByCreatedAtAsc(byte[] orderId);
}
