package com.maxsolch.shop.preorder;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

/** One line of a batch (V73): a product or one of its variants, how many were ordered and arrived. */
@Getter
@Setter
@Entity
@Table(name = "preorder_batch_items")
public class PreorderBatchItem {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "batch_id", nullable = false)
    private Long batchId;

    @Column(name = "product_id", columnDefinition = "BINARY(16)", nullable = false)
    private byte[] productId;

    @Column(name = "variant_id", columnDefinition = "BINARY(16)")
    private byte[] variantId;

    @Column(name = "qty_ordered", nullable = false)
    private int qtyOrdered;

    @Column(name = "qty_arrived")
    private Integer qtyArrived;

    /** Purchase price per unit in minor units of the batch currency; main admin only. */
    @Column(name = "unit_price_fx")
    private Long unitPriceFx;

    /** Weight of one unit, grams — for the BY_WEIGHT allocation (V74). */
    @Column(name = "weight_g")
    private Integer weightG;

    /** MANUAL allocation: this line's share of the batch expenses, UAH kopecks for the whole line. */
    @Column(name = "manual_extra_minor")
    private Long manualExtraMinor;
}
