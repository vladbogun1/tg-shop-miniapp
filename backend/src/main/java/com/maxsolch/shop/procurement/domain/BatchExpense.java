package com.maxsolch.shop.procurement.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.CreationTimestamp;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;

/** An expense of a batch after the factory (V74): freight, customs, broker, delivery in Ukraine, bank. */
@Getter
@Setter
@Entity
@Table(name = "batch_expenses")
public class BatchExpense {

    public enum Kind { FREIGHT, CUSTOMS, BROKER, DOMESTIC, BANK, OTHER }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "batch_id", nullable = false)
    private Long batchId;

    /** null = the whole batch, else only this line. */
    @Column(name = "batch_item_id")
    private Long batchItemId;

    @Column(name = "kind", nullable = false, length = 10)
    private String kind;

    /** Minor units of {@link #currency}; negative = a compensation from the factory. */
    @Column(name = "amount_minor", nullable = false)
    private long amountMinor;

    @Column(name = "currency", nullable = false, length = 3)
    private String currency = "UAH";

    /** UAH per 1 unit of the currency; null for UAH. */
    @Column(name = "fx_rate", precision = 12, scale = 4)
    private BigDecimal fxRate;

    @Column(name = "spent_on")
    private LocalDate spentOn;

    @Column(name = "note", length = 500)
    private String note;

    @Column(name = "created_by", length = 255)
    private String createdBy;

    /** Set by Hibernate on insert (the domain does not read the clock). */
    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;
}
