package com.maxsolch.shop.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
@Entity
@Table(name = "order_items")
public class OrderItem {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id", nullable = false)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "order_id", nullable = false)
    private Order order;

    @Column(name = "product_id", columnDefinition = "BINARY(16)", nullable = false)
    private byte[] productId;

    @Column(name = "title_snapshot", nullable = false, length = 255)
    private String titleSnapshot;

    @Column(name = "price_minor_snapshot", nullable = false)
    private long priceMinorSnapshot;

    @Column(name = "variant_id", columnDefinition = "BINARY(16)")
    private byte[] variantId;

    @Column(name = "variant_name_snapshot", length = 128)
    private String variantNameSnapshot;

    @Column(name = "quantity", nullable = false)
    private int quantity;

    /** Free gift added by an admin (price 0, but stock is still decremented). */
    @Column(name = "gift", nullable = false)
    private boolean gift = false;

    /** Units of this line the customer sent back (partial or full return). */
    @Column(name = "returned_qty", nullable = false)
    private int returnedQty = 0;

    /**
     * Units of this line already put back on the shelf (by a return or a rejection). Restoring
     * stock only ever adds {@code quantity - restockedQty}, so no unit can be restocked twice.
     */
    @Column(name = "restocked_qty", nullable = false)
    private int restockedQty = 0;
}
