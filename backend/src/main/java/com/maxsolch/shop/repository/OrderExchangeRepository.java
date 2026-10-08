package com.maxsolch.shop.repository;

import com.maxsolch.shop.domain.OrderExchange;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface OrderExchangeRepository extends JpaRepository<OrderExchange, Long> {

    List<OrderExchange> findByOrderIdOrderByCreatedAtAsc(byte[] orderId);
}
