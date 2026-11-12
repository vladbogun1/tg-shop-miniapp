package com.maxsolch.shop.staff.api;

import com.fasterxml.jackson.annotation.JsonRawValue;
import com.maxsolch.shop.platform.security.RequiredAdmin;
import com.maxsolch.shop.platform.security.RequiredSuperAdmin;
import com.maxsolch.shop.staff.app.AdminTelemetry;
import com.maxsolch.shop.staff.app.TelemetryBatch;
import com.maxsolch.shop.staff.domain.AdminClientEvent;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.util.List;

/**
 * Telemetry of the admin panel (V99): every admin's panel sends its errors, freezes and dead taps; the main admin reads
 * the latest. Separate from the customer analytics on purpose — admin events never count as shop activity.
 */
@RestController
@RequestMapping("/api/admin/telemetry")
@Tag(name = "Admin Telemetry", description = "Admin panel client telemetry (errors, freezes, blocked taps)")
@SecurityRequirement(name = "bearer-jwt")
public class AdminTelemetryController {

    private final AdminTelemetry telemetry;

    public AdminTelemetryController(AdminTelemetry telemetry) {
        this.telemetry = telemetry;
    }

    public record AdminClientEventDto(long id, long adminId, String kind, String path, String build, String ua,
                                      boolean standalone,
                                      @JsonRawValue @Schema(type = "object", description = "details as sent (≤ 2 KB)") String meta,
                                      Instant createdAt) {
        static AdminClientEventDto of(AdminClientEvent e) {
            return new AdminClientEventDto(e.id(), e.adminId(), e.kind(), e.path(), e.build(), e.ua(), e.standalone(),
                    e.metaJson(), e.createdAt());
        }
    }

    @PostMapping
    @RequiredAdmin
    @Operation(summary = "Store a batch of panel events (≤ 50; unknown kinds and the overflow are dropped); always 204")
    public ResponseEntity<Void> submit(@RequestBody(required = false) TelemetryBatch batch) {
        telemetry.record(batch);
        return ResponseEntity.noContent().build();
    }

    @GetMapping
    @RequiredSuperAdmin
    @Operation(summary = "Latest panel events, newest first (main admin only)")
    public List<AdminClientEventDto> latest(@RequestParam(required = false) Integer limit,
                                            @RequestParam(required = false) String kind,
                                            @RequestParam(required = false) Long adminId) {
        return telemetry.latest(limit, kind, adminId).stream().map(AdminClientEventDto::of).toList();
    }
}
