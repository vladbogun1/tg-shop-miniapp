package com.maxsolch.shop.returns.infra;

import com.maxsolch.shop.returns.domain.OrderExchangeLine;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;

public interface OrderExchangeLineRepository extends JpaRepository<OrderExchangeLine, Long> {

    List<OrderExchangeLine> findByExchangeIdIn(Collection<Long> exchangeIds);
}
