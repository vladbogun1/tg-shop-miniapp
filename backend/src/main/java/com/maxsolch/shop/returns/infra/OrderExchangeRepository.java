package com.maxsolch.shop.returns.infra;

import com.maxsolch.shop.returns.domain.OrderExchange;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface OrderExchangeRepository extends JpaRepository<OrderExchange, Long> {

    List<OrderExchange> findByOrderIdOrderByCreatedAtAsc(byte[] orderId);
}
