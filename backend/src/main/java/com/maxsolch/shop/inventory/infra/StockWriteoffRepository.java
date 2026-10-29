package com.maxsolch.shop.inventory.infra;

import com.maxsolch.shop.inventory.domain.StockWriteoff;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.Instant;
import java.util.List;

public interface StockWriteoffRepository extends JpaRepository<StockWriteoff, Long> {

    List<StockWriteoff> findByCreatedAtGreaterThanEqualOrderByCreatedAtDesc(Instant from);

    List<StockWriteoff> findAllByOrderByCreatedAtDesc();

    List<StockWriteoff> findByOrderIdOrderByCreatedAtAsc(byte[] orderId);
}
