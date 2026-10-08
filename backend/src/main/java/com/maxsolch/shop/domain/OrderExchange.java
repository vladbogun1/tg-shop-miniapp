package com.maxsolch.shop.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

import java.time.Instant;

/**
 * One exchange on a paid order (V51): what the customer sent back, what goes out instead, the
 * tracking number and total before. The order itself is changed in place — this row is its trace.
 */
@Getter
@Setter
@Entity
@Table(name = "order_exchanges")
public class OrderExchange {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "order_id", columnDefinition = "BINARY(16)", nullable = false)
    private byte[] orderId;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "previous_status", nullable = false, length = 16)
    private String previousStatus;

    @Column(name = "previous_tracking", length = 128)
    private String previousTracking;

    @Column(name = "returned_summary", nullable = false, length = 2000)
    private String returnedSummary;

    @Column(name = "given_summary", nullable = false, length = 2000)
    private String givenSummary;

    @Column(name = "total_before_minor", nullable = false)
    private long totalBeforeMinor;

    @Column(name = "total_after_minor", nullable = false)
    private long totalAfterMinor;

    @Column(name = "note", length = 500)
    private String note;

    @Column(name = "admin_name", length = 255)
    private String adminName;

    @PrePersist
    void prePersist() {
        if (createdAt == null) {
            createdAt = Instant.now();
        }
    }
}
