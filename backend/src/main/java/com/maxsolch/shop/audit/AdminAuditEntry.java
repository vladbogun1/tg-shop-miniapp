package com.maxsolch.shop.audit;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

import java.time.Instant;

/** One recorded admin action. Append-only: rows are never updated or deleted by the app. */
@Getter
@Setter
@Entity
@Table(name = "admin_audit_log")
public class AdminAuditEntry {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id", nullable = false)
    private Long id;

    @Column(name = "admin_id", nullable = false)
    private Long adminId;

    /** Name as it was at the time — the admin row may be renamed or deactivated later. */
    @Column(name = "admin_name", length = 255)
    private String adminName;

    @Column(name = "action", nullable = false, length = 64)
    private String action;

    @Column(name = "entity_type", nullable = false, length = 32)
    private String entityType;

    @Column(name = "entity_id", length = 64)
    private String entityId;

    @Column(name = "details", length = 1024)
    private String details;

    @Column(name = "created_at", nullable = false, updatable = false, insertable = false)
    private Instant createdAt;
}
