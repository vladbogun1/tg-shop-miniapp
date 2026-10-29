package com.maxsolch.shop.procurement.infra;

import com.maxsolch.shop.procurement.domain.BatchExpense;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface BatchExpenseRepository extends JpaRepository<BatchExpense, Long> {

    List<BatchExpense> findByBatchIdOrderByIdAsc(Long batchId);
}
