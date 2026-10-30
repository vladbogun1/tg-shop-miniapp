package com.maxsolch.shop.staff.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

import java.time.Instant;

/**
 * «Инциденты» (V68) — the super admin's page of money/order cases to look into: found by the
 * detector ({@code code} starts with {@code auto:}) or loaded by hand with a hypothesis.
 */
@Getter
@Setter
@Entity
@Table(name = "admin_incidents")
public class AdminIncident {

    public static final String OPEN = "OPEN";
    public static final String RESOLVED = "RESOLVED";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "code", nullable = false, length = 64)
    private String code;

    @Column(name = "title", nullable = false, length = 255)
    private String title;

    /** Order UUID as text (it may be a deleted order that no longer has a row). */
    @Column(name = "order_ref", length = 36)
    private String orderRef;

    /** HIGH | MEDIUM | LOW. */
    @Column(name = "severity", nullable = false, length = 8)
    private String severity = "MEDIUM";

    @Column(name = "status", nullable = false, length = 16)
    private String status = OPEN;

    @Column(name = "facts", columnDefinition = "TEXT")
    private String facts;

    @Column(name = "hypothesis", columnDefinition = "TEXT")
    private String hypothesis;

    @Column(name = "suggestion", columnDefinition = "TEXT")
    private String suggestion;

    @Column(name = "resolution", length = 1000)
    private String resolution;

    @Column(name = "resolved_by", length = 255)
    private String resolvedBy;

    @Column(name = "resolved_at")
    private Instant resolvedAt;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;
}
