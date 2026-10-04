package com.maxsolch.shop.audit;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;

public interface AdminAuditRepository extends JpaRepository<AdminAuditEntry, Long> {

    Page<AdminAuditEntry> findAllByOrderByCreatedAtDesc(Pageable pageable);

    /**
     * The «Журнал» page and the per-entity history (order/product cards): every filter is optional
     * (null = any). {@code entityType + entityId} hits {@code idx_audit_entity}.
     */
    @Query("""
            SELECT e FROM AdminAuditEntry e
            WHERE (:action IS NULL OR e.action = :action)
              AND (:entityType IS NULL OR e.entityType = :entityType)
              AND (:entityId IS NULL OR e.entityId = :entityId)
              AND (:adminId IS NULL OR e.adminId = :adminId)
              AND (:from IS NULL OR e.createdAt >= :from)
              AND (:to IS NULL OR e.createdAt < :to)
            ORDER BY e.createdAt DESC, e.id DESC
            """)
    List<AdminAuditEntry> search(@Param("action") String action,
                                 @Param("entityType") String entityType,
                                 @Param("entityId") String entityId,
                                 @Param("adminId") Long adminId,
                                 @Param("from") Instant from,
                                 @Param("to") Instant to,
                                 Pageable pageable);

    /** Values for the filter dropdowns. */
    @Query("SELECT DISTINCT e.action FROM AdminAuditEntry e ORDER BY e.action")
    List<String> distinctActions();

    @Query("SELECT DISTINCT e.entityType FROM AdminAuditEntry e ORDER BY e.entityType")
    List<String> distinctEntityTypes();

    /** [adminId, adminName (latest seen)] of everyone who has entries. */
    @Query("SELECT e.adminId, MAX(e.adminName) FROM AdminAuditEntry e GROUP BY e.adminId")
    List<Object[]> admins();
}
