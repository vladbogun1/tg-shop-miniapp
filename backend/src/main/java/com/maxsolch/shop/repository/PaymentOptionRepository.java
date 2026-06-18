package com.maxsolch.shop.repository;

import com.maxsolch.shop.domain.PaymentOption;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface PaymentOptionRepository extends JpaRepository<PaymentOption, byte[]> {

    List<PaymentOption> findByActiveTrueOrderBySortOrderAsc();

    List<PaymentOption> findAllByOrderBySortOrderAsc();
}
