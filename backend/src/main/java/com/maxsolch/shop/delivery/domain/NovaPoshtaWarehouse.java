package com.maxsolch.shop.delivery.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

import java.time.Instant;

@Getter
@Setter
@Entity
@Table(name = "nova_poshta_warehouses")
public class NovaPoshtaWarehouse {

    @Id
    @Column(name = "ref", nullable = false, length = 64)
    private String ref;

    @Column(name = "city_ref", nullable = false, length = 64)
    private String cityRef;

    @Column(name = "city_name", length = 255)
    private String cityName;

    @Column(name = "number", length = 32)
    private String number;

    @Column(name = "description", length = 512)
    private String description;

    @Column(name = "type", length = 64)
    private String type;

    @Column(name = "lat")
    private Double lat;

    @Column(name = "lng")
    private Double lng;

    /** Max weight of one parcel here, kg (PlaceMaxWeightAllowed, V65); null/0 = unknown. */
    @Column(name = "max_weight_kg")
    private Integer maxWeightKg;

    /** POSTOMAT | BRANCH | POINT | OTHER, from Address.getWarehouseTypes (V66). */
    @Column(name = "category", length = 16)
    private String category;

    /** False = closed (WarehouseStatus) or gone from the NP directory (V66): not offered, not accepted. */
    @Column(name = "active", nullable = false)
    private boolean active = true;

    @Column(name = "status", length = 32)
    private String status;

    /** Largest place it accepts, mm (ReceivingLimitationsOnDimensions, V66); null = unknown. */
    @Column(name = "max_length_mm")
    private Integer maxLengthMm;

    @Column(name = "max_width_mm")
    private Integer maxWidthMm;

    @Column(name = "max_height_mm")
    private Integer maxHeightMm;

    /** Last sync that listed it (V66). */
    @Column(name = "seen_at")
    private Instant seenAt;

    @Column(name = "updated_at", nullable = false, insertable = false, updatable = false)
    private Instant updatedAt;
}
