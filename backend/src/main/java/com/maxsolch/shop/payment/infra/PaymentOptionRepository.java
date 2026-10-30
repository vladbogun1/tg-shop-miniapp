package com.maxsolch.shop.payment.infra;

import com.maxsolch.shop.payment.domain.PaymentOption;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface PaymentOptionRepository extends JpaRepository<PaymentOption, byte[]> {

    List<PaymentOption> findByActiveTrueOrderBySortOrderAsc();

    List<PaymentOption> findAllByOrderBySortOrderAsc();

    /** Of these ids, the ones that still exist (the translation sweep asks which rows lost their entity). */
    @org.springframework.data.jpa.repository.Query("select e.id from PaymentOption e where e.id in :ids")
    java.util.List<byte[]> existingIds(@org.springframework.data.repository.query.Param("ids") java.util.Collection<byte[]> ids);
}
