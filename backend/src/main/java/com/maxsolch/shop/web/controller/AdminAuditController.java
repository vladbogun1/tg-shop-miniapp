package com.maxsolch.shop.web.controller;

import com.maxsolch.shop.audit.AdminAuditEntry;
import com.maxsolch.shop.audit.AdminAuditRepository;
import com.maxsolch.shop.security.RequiredAdmin;
import com.maxsolch.shop.web.dto.AuditEntryDto;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.data.domain.PageRequest;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/** Read-only view of the admin action log. There is deliberately no way to edit or delete rows. */
@RestController
@RequestMapping("/api/admin/audit")
@RequiredAdmin
@Tag(name = "Admin Audit", description = "Who did what in the admin panel")
@SecurityRequirement(name = "bearer-jwt")
public class AdminAuditController {

    private final AdminAuditRepository repository;

    public AdminAuditController(AdminAuditRepository repository) {
        this.repository = repository;
    }

    @GetMapping
    @Operation(summary = "Recent admin actions (newest first)")
    public List<AuditEntryDto> list(@RequestParam(defaultValue = "0") int page,
                                    @RequestParam(defaultValue = "50") int size) {
        int capped = Math.min(Math.max(1, size), 200);
        return repository.findAllByOrderByCreatedAtDesc(PageRequest.of(Math.max(0, page), capped))
                .getContent().stream()
                .map(AdminAuditController::toDto)
                .toList();
    }

    private static AuditEntryDto toDto(AdminAuditEntry e) {
        return new AuditEntryDto(e.getId(), e.getAdminId(), e.getAdminName(), e.getAction(),
                e.getEntityType(), e.getEntityId(), e.getDetails(), e.getCreatedAt());
    }
}
