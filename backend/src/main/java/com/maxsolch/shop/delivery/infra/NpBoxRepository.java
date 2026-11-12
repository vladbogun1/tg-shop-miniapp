package com.maxsolch.shop.delivery.infra;

import com.maxsolch.shop.delivery.domain.NpBox;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface NpBoxRepository extends JpaRepository<NpBox, byte[]> {

    List<NpBox> findAllByOrderBySortOrderAscNameAsc();

    List<NpBox> findByInStockTrueOrderBySortOrderAscNameAsc();

    boolean existsByInStockTrue();
}
