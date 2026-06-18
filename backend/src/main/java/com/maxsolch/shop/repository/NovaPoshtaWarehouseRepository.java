package com.maxsolch.shop.repository;

import com.maxsolch.shop.domain.NovaPoshtaWarehouse;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface NovaPoshtaWarehouseRepository extends JpaRepository<NovaPoshtaWarehouse, String> {

    List<NovaPoshtaWarehouse> findByCityRefOrderByNumberAsc(String cityRef);

    List<NovaPoshtaWarehouse> findTop100ByCityRefAndDescriptionContainingIgnoreCaseOrderByNumberAsc(
            String cityRef, String description);

    /** Warehouses inside a lat/lng bounding box, optionally filtered by type ref + text. Capped via Pageable. */
    @Query("select w from NovaPoshtaWarehouse w "
            + "where w.lat between :minLat and :maxLat and w.lng between :minLng and :maxLng "
            + "and (:type is null or w.type = :type) "
            + "and (:q is null or lower(w.description) like :q or lower(w.number) like :q)")
    List<NovaPoshtaWarehouse> findInBox(@Param("minLat") double minLat,
                                        @Param("maxLat") double maxLat,
                                        @Param("minLng") double minLng,
                                        @Param("maxLng") double maxLng,
                                        @Param("type") String type,
                                        @Param("q") String q,
                                        Pageable pageable);
}
