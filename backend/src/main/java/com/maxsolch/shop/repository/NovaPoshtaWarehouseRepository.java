package com.maxsolch.shop.repository;

import com.maxsolch.shop.domain.NovaPoshtaWarehouse;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface NovaPoshtaWarehouseRepository extends JpaRepository<NovaPoshtaWarehouse, String> {

    List<NovaPoshtaWarehouse> findByCityRefOrderByNumberAsc(String cityRef);

    List<NovaPoshtaWarehouse> findTop100ByCityRefAndDescriptionContainingIgnoreCaseOrderByNumberAsc(
            String cityRef, String description);
}
