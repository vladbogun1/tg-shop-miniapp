package com.maxsolch.shop.returns.infra;

import com.maxsolch.shop.returns.domain.OrderReturn;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface OrderReturnRepository extends JpaRepository<OrderReturn, Long> {

    List<OrderReturn> findByOrderIdOrderByIdAsc(byte[] orderId);
}
