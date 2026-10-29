package com.maxsolch.shop.returns.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

/** One line an exchange took back (V68): the order drops those units, this keeps them on record. */
@Getter
@Setter
@Entity
@Table(name = "order_exchange_lines")
public class OrderExchangeLine {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "exchange_id", nullable = false)
    private Long exchangeId;

    @Column(name = "product_id", columnDefinition = "BINARY(16)", nullable = false)
    private byte[] productId;

    @Column(name = "variant_id", columnDefinition = "BINARY(16)")
    private byte[] variantId;

    @Column(name = "title", nullable = false, length = 255)
    private String title;

    @Column(name = "quantity", nullable = false)
    private int quantity;

    @Column(name = "unit_price_minor", nullable = false)
    private long unitPriceMinor;

    /** RESTOCK | DEFECT. */
    @Column(name = "outcome", nullable = false, length = 16)
    private String outcome;
}
