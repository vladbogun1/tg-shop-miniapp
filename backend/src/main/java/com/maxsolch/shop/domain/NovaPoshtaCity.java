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
@Table(name = "nova_poshta_cities")
public class NovaPoshtaCity {

    @Id
    @Column(name = "ref", nullable = false, length = 64)
    private String ref;

    @Column(name = "name", nullable = false, length = 255)
    private String name;

    @Column(name = "area", length = 255)
    private String area;

    @Column(name = "updated_at", nullable = false, insertable = false, updatable = false)
    private Instant updatedAt;
}
