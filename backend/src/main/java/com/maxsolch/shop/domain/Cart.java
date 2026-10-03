package com.maxsolch.shop.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

import java.time.Instant;

/**
 * Header row of a customer's server-side cart (V22): the version clients compare to notice a change
 * made on another device, and the row every cart write locks first, so a merge and a replace for the
 * same customer never interleave. The lines are {@link CartItem}s.
 */
@Getter
@Setter
@Entity
@Table(name = "carts")
public class Cart {

    @Id
    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "version", nullable = false)
    private long version;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;
}
