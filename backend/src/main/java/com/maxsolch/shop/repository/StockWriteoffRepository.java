package com.maxsolch.shop.repository;

import com.maxsolch.shop.domain.StockWriteoff;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.Instant;
import java.util.List;

public interface StockWriteoffRepository extends JpaRepository<StockWriteoff, Long> {

    List<StockWriteoff> findByCreatedAtGreaterThanEqualOrderByCreatedAtDesc(Instant from);

    List<StockWriteoff> findAllByOrderByCreatedAtDesc();

    List<StockWriteoff> findByOrderIdOrderByCreatedAtAsc(byte[] orderId);
}
