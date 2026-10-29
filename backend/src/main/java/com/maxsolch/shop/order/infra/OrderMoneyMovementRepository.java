package com.maxsolch.shop.order.infra;

import com.maxsolch.shop.order.domain.OrderMoneyMovement;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.Instant;
import java.util.List;

public interface OrderMoneyMovementRepository extends JpaRepository<OrderMoneyMovement, Long> {

    List<OrderMoneyMovement> findByOrderIdOrderByOccurredAtAscIdAsc(byte[] orderId);

    List<OrderMoneyMovement> findByKindAndOccurredAtGreaterThanEqual(String kind, Instant from);

    List<OrderMoneyMovement> findByKind(String kind);
}
