package com.maxsolch.shop.delivery.infra;

import com.maxsolch.shop.delivery.domain.NovaPoshtaWarehouse;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface NovaPoshtaWarehouseRepository extends JpaRepository<NovaPoshtaWarehouse, String> {

    List<NovaPoshtaWarehouse> findByCityRefAndActiveTrueOrderByNumberAsc(String cityRef);

    List<NovaPoshtaWarehouse> findTop100ByCityRefAndActiveTrueAndDescriptionContainingIgnoreCaseOrderByNumberAsc(
            String cityRef, String description);

    /** Rows the sync that started at {@code since} did not list: closed or removed at NP. */
    @org.springframework.data.jpa.repository.Modifying
    @Query("update NovaPoshtaWarehouse w set w.active = false where w.active = true "
            + "and (w.seenAt is null or w.seenAt < :since)")
    int deactivateNotSeenSince(@Param("since") java.time.Instant since);

    /**
     * Warehouses inside a lat/lng bounding box, optionally filtered by type refs + text. Capped via Pageable.
     * {@code anyType} = ignore {@code types} (JPQL cannot test an empty list for null).
     */
    @Query("select w from NovaPoshtaWarehouse w "
            + "where w.lat between :minLat and :maxLat and w.lng between :minLng and :maxLng "
            + "and w.active = true "
            + "and (:anyType = true or w.category in :types or (w.category is null and w.type in :refs)) "
            + "and (:q is null or lower(w.description) like :q or lower(w.number) like :q)")
    List<NovaPoshtaWarehouse> findInBox(@Param("minLat") double minLat,
                                        @Param("maxLat") double maxLat,
                                        @Param("minLng") double minLng,
                                        @Param("maxLng") double maxLng,
                                        @Param("anyType") boolean anyType,
                                        @Param("types") java.util.Collection<String> types,
                                        @Param("refs") java.util.Collection<String> refs,
                                        @Param("q") String q,
                                        Pageable pageable);
}
