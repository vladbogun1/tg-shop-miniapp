package com.maxsolch.shop.staff.api;

import com.maxsolch.shop.platform.audit.AdminAuditService;
import com.maxsolch.shop.staff.domain.AdminIncident;
import com.maxsolch.shop.platform.security.RequiredSuperAdmin;
import com.maxsolch.shop.staff.app.IncidentService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.util.List;

/** «Инциденты» (V68) — SUPER_ADMIN only: cases the detector found plus hand-made cards. */
@RestController
@RequestMapping("/api/admin/incidents")
@RequiredSuperAdmin
@Tag(name = "Admin Incidents", description = "Super admin: money/order cases to look into")
@SecurityRequirement(name = "bearer-jwt")
public class AdminIncidentController {

    private final IncidentService incidents;
    private final AdminAuditService audit;

    public AdminIncidentController(IncidentService incidents, AdminAuditService audit) {
        this.incidents = incidents;
        this.audit = audit;
    }

    public record IncidentDto(long id, String code, boolean auto, String title, String orderRef, String severity,
                              String status, String facts, String hypothesis, String suggestion, String resolution,
                              String resolvedBy, Instant resolvedAt, Instant createdAt) {
        static IncidentDto of(AdminIncident i) {
            return new IncidentDto(i.getId(), i.getCode(), i.getCode().startsWith("auto:"), i.getTitle(),
                    i.getOrderRef(), i.getSeverity(), i.getStatus(), i.getFacts(), i.getHypothesis(),
                    i.getSuggestion(), i.getResolution(), i.getResolvedBy(), i.getResolvedAt(), i.getCreatedAt());
        }
    }

    public record ResolveRequest(String resolution) {
    }

    @GetMapping
    @Operation(summary = "Open cases first; re-runs the detector (new cases appear, fixed ones close)")
    public List<IncidentDto> list() {
        return incidents.list().stream().map(IncidentDto::of).toList();
    }

    @PostMapping("/{id}/resolve")
    @Operation(summary = "Close a case with what was done")
    public IncidentDto resolve(@PathVariable long id, @RequestBody ResolveRequest r) {
        AdminIncident i = incidents.resolve(id, r.resolution(), audit.currentAdminName());
        audit.record("INCIDENT_RESOLVE", "INCIDENT", String.valueOf(id), i.getTitle() + ": " + i.getResolution());
        return IncidentDto.of(i);
    }

    @PostMapping("/{id}/reopen")
    @Operation(summary = "Open a closed case again")
    public IncidentDto reopen(@PathVariable long id) {
        AdminIncident i = incidents.reopen(id);
        audit.record("INCIDENT_REOPEN", "INCIDENT", String.valueOf(id), i.getTitle());
        return IncidentDto.of(i);
    }
}
