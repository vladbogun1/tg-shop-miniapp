package com.maxsolch.shop.audit.api;

import com.maxsolch.shop.audit.domain.AdminAuditEntry;
import com.maxsolch.shop.audit.app.AdminAuditQueries;
import com.maxsolch.shop.platform.security.RequiredAdmin;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import com.maxsolch.shop.platform.time.ShopZone;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.DateTimeException;
import java.time.Instant;
import java.util.List;
import java.util.Map;

import static com.maxsolch.shop.platform.util.Texts.trimToNull;

/**
 * Read-only view of the admin action log. There is deliberately no way to edit or delete rows.
 *
 * <p>Filters (all optional): {@code action}, {@code entityType}, {@code entityId}, {@code adminId},
 * {@code from}/{@code to} — calendar days {@code yyyy-MM-dd} in the shop timezone, {@code to}
 * inclusive. The order/product card history uses {@code ?entityType=ORDER&entityId=<uuid>}.
 */
@RestController
@RequestMapping("/api/admin/audit")
@RequiredAdmin
@Tag(name = "Admin Audit", description = "Who did what in the admin panel")
@SecurityRequirement(name = "bearer-jwt")
public class AdminAuditController {

    private final AdminAuditQueries repository;
    private final ShopZone shopZone;

    public AdminAuditController(AdminAuditQueries repository,
                                ShopZone shopZone) {
        this.repository = repository;
        this.shopZone = shopZone;
    }

    @GetMapping
    @Operation(summary = "Admin actions, newest first, with optional filters")
    public List<AuditEntryDto> list(@RequestParam(defaultValue = "0") int page,
                                    @RequestParam(defaultValue = "50") int size,
                                    @RequestParam(required = false) String action,
                                    @RequestParam(required = false) String entityType,
                                    @RequestParam(required = false) String entityId,
                                    @RequestParam(required = false) Long adminId,
                                    @RequestParam(required = false) String from,
                                    @RequestParam(required = false) String to) {
        int capped = Math.min(Math.max(1, size), 200);
        Instant fromTs = shopZone.day(from, false);
        Instant toTs = shopZone.day(to, true);
        return repository.search(trimToNull(action), trimToNull(entityType), trimToNull(entityId), adminId,
                        fromTs, toTs, Math.max(0, page), capped)
                .stream()
                .map(AdminAuditController::toDto)
                .toList();
    }

    @GetMapping("/facets")
    @Operation(summary = "Distinct actions, entity types and admins for the filter dropdowns")
    public Map<String, Object> facets() {
        List<Map<String, Object>> admins = repository.admins().stream()
                .map(r -> Map.<String, Object>of(
                        "adminId", r[0],
                        "adminName", r[1] == null ? String.valueOf(r[0]) : r[1]))
                .toList();
        return Map.of(
                "actions", repository.distinctActions(),
                "entityTypes", repository.distinctEntityTypes(),
                "admins", admins);
    }

    private static AuditEntryDto toDto(AdminAuditEntry e) {
        return new AuditEntryDto(e.getId(), e.getAdminId(), e.getAdminName(), e.getAction(),
                e.getEntityType(), e.getEntityId(), e.getDetails(), e.getCreatedAt());
    }
}
