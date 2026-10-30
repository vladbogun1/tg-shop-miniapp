package com.maxsolch.shop.notification.api;

import com.maxsolch.shop.notification.app.BroadcastDeliveryReport;
import com.maxsolch.shop.platform.security.RequiredAdmin;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/** The journal's broadcast tab; the URL stays under {@code /api/admin/activity} where the admin app calls it. */
@RestController
@RequestMapping("/api/admin/activity")
@RequiredAdmin
@Tag(name = "Admin Activity", description = "Bot / site / Mini App / payment events")
@SecurityRequirement(name = "bearer-jwt")
public class BroadcastDeliveryController {

    private final BroadcastDeliveryReport report;

    public BroadcastDeliveryController(BroadcastDeliveryReport report) {
        this.report = report;
    }

    @GetMapping("/broadcasts")
    @Operation(summary = "Recent broadcasts with delivered / not delivered counts and the reasons")
    public List<BroadcastDeliveryReport.Summary> broadcasts(@RequestParam(defaultValue = "20") int limit) {
        return report.recent(limit);
    }
}
