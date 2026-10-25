package com.maxsolch.shop.repository;

import com.maxsolch.shop.domain.OrderReturn;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface OrderReturnRepository extends JpaRepository<OrderReturn, Long> {

    List<OrderReturn> findByOrderIdOrderByIdAsc(byte[] orderId);
}
