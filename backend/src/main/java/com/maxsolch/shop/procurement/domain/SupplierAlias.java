package com.maxsolch.shop.procurement.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

/**
 * Supplier memory (V81): a line of this supplier's invoice / order, by its normalized text, is this product
 * or variant of ours. Written by «Поставка с ИИ» when the admin confirms a match, read to match the next batch.
 */
@Getter
@Setter
@Entity
@Table(name = "supplier_aliases")
public class SupplierAlias {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "supplier_id", nullable = false)
    private Long supplierId;

    @Column(name = "source_key", nullable = false, length = 255)
    private String sourceKey;

    @Column(name = "product_id", columnDefinition = "BINARY(16)", nullable = false)
    private byte[] productId;

    @Column(name = "variant_id", columnDefinition = "BINARY(16)")
    private byte[] variantId;
}
