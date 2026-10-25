package com.maxsolch.shop.repository;

import com.maxsolch.shop.domain.OrderReturnLine;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;

public interface OrderReturnLineRepository extends JpaRepository<OrderReturnLine, Long> {

    List<OrderReturnLine> findByReturnIdInOrderByIdAsc(Collection<Long> returnIds);

    List<OrderReturnLine> findByWriteoffId(Long writeoffId);
}
