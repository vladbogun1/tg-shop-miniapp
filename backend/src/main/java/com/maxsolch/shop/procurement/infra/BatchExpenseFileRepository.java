package com.maxsolch.shop.procurement.infra;

import com.maxsolch.shop.procurement.domain.BatchExpenseFile;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;

public interface BatchExpenseFileRepository extends JpaRepository<BatchExpenseFile, Long> {

    List<BatchExpenseFile> findByExpenseIdInOrderByIdAsc(Collection<Long> expenseIds);

    List<BatchExpenseFile> findByExpenseId(Long expenseId);
}
