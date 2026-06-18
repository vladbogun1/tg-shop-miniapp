package com.maxsolch.shop.web.controller;

import com.maxsolch.shop.security.RequiredAdmin;
import com.maxsolch.shop.service.MetricsService;
import com.maxsolch.shop.service.TimeRange;
import com.maxsolch.shop.web.dto.MetricsDto;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/admin/metrics")
@RequiredAdmin
@Tag(name = "Admin Metrics", description = "Order analytics over a time range")
@SecurityRequirement(name = "bearer-jwt")
public class AdminMetricsController {

    private final MetricsService metricsService;

    public AdminMetricsController(MetricsService metricsService) {
        this.metricsService = metricsService;
    }

    @GetMapping
    @Operation(summary = "Order metrics/analytics for range=month|halfyear|year|all (default month)")
    public MetricsDto metrics(@RequestParam(defaultValue = "month") String range) {
        return metricsService.compute(TimeRange.parse(range));
    }
}
