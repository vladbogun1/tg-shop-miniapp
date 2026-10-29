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

import java.time.Instant;

/** A document of an expense (V74): a photo or PDF in the private {@code costing/} prefix of the bucket. */
@Getter
@Setter
@Entity
@Table(name = "batch_expense_files")
public class BatchExpenseFile {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "expense_id", nullable = false)
    private Long expenseId;

    @Column(name = "object_key", nullable = false, length = 500)
    private String objectKey;

    @Column(name = "file_name", nullable = false)
    private String fileName;

    @Column(name = "content_type", length = 100)
    private String contentType;

    @Column(name = "size_bytes", nullable = false)
    private long sizeBytes;

    @Column(name = "created_by")
    private String createdBy;

    /** Set by Hibernate on insert (the domain does not read the clock). */
    @CreationTimestamp
    @Column(name = "created_at", nullable = false)
    private Instant createdAt;
}
