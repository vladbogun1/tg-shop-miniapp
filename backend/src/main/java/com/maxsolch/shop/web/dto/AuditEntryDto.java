package com.maxsolch.shop.web.dto;

import java.time.Instant;

/** One row of the admin action log. */
public record AuditEntryDto(
        Long id,
        Long adminId,
        String adminName,
        String action,
        String entityType,
        String entityId,
        String details,
        Instant createdAt) {
}
