package com.maxsolch.shop.payment.infra;

import com.maxsolch.shop.payment.domain.PaymentOption;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface PaymentOptionRepository extends JpaRepository<PaymentOption, byte[]> {

    List<PaymentOption> findByActiveTrueOrderBySortOrderAsc();

    List<PaymentOption> findAllByOrderBySortOrderAsc();
}
