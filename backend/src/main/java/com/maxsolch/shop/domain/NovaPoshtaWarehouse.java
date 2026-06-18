package com.maxsolch.shop.domain;

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

    @Column(name = "updated_at", nullable = false, insertable = false, updatable = false)
    private Instant updatedAt;
}
