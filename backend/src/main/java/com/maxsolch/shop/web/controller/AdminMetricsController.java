package com.maxsolch.shop.web.controller;

import com.maxsolch.shop.analytics.metrics.AdminMetricsService;
import com.maxsolch.shop.analytics.metrics.ChannelFilter;
import com.maxsolch.shop.analytics.metrics.MetricsDtos;
import com.maxsolch.shop.analytics.metrics.MetricsPeriod;
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

/**
 * Admin analytics. {@code GET /api/admin/metrics?range=} is the original single-payload dashboard
 * (kept for compatibility); the tabbed metrics page uses the per-tab endpoints below, all taking
 * {@code period=today|7d|month|prevmonth|90d|year|custom} (+ {@code from}/{@code to} as yyyy-MM-dd for
 * custom) and {@code channel=all|miniapp|web}.
 */
@RestController
@RequestMapping("/api/admin/metrics")
@RequiredAdmin
@Tag(name = "Admin Metrics", description = "Order analytics over a time range")
@SecurityRequirement(name = "bearer-jwt")
public class AdminMetricsController {

    private final MetricsService metricsService;
    private final AdminMetricsService metrics;

    public AdminMetricsController(MetricsService metricsService, AdminMetricsService metrics) {
        this.metricsService = metricsService;
        this.metrics = metrics;
    }

    @GetMapping
    @Operation(summary = "Order metrics/analytics for range=month|halfyear|year|all (default month)")
    public MetricsDto metrics(@RequestParam(defaultValue = "month") String range) {
        return metricsService.compute(TimeRange.parse(range));
    }

    @GetMapping("/overview")
    @Operation(summary = "Overview tab: sold/received KPIs vs previous period, series, categories, channels, heatmap")
    public MetricsDtos.Overview overview(@RequestParam(defaultValue = "month") String period,
                                         @RequestParam(required = false) String from,
                                         @RequestParam(required = false) String to,
                                         @RequestParam(defaultValue = "all") String channel) {
        return metrics.overview(period(period, from, to), ChannelFilter.parse(channel));
    }

    @GetMapping("/stock")
    @Operation(summary = "Products & stock tab: stock value, dead/forgotten stock, top products, reorder list")
    public MetricsDtos.Stock stock(@RequestParam(defaultValue = "month") String period,
                                   @RequestParam(required = false) String from,
                                   @RequestParam(required = false) String to,
                                   @RequestParam(defaultValue = "all") String channel,
                                   @RequestParam(defaultValue = "60") int deadDays,
                                   @RequestParam(defaultValue = "30") int coverDays) {
        return metrics.stock(period(period, from, to), ChannelFilter.parse(channel), deadDays, coverDays);
    }

    @GetMapping("/customers")
    @Operation(summary = "Customers tab: buyers, repeat rate, cohorts, signups→buyers, promo codes, baskets")
    public MetricsDtos.Customers customers(@RequestParam(defaultValue = "month") String period,
                                           @RequestParam(required = false) String from,
                                           @RequestParam(required = false) String to,
                                           @RequestParam(defaultValue = "all") String channel) {
        return metrics.customers(period(period, from, to), ChannelFilter.parse(channel));
    }

    @GetMapping("/funnel")
    @Operation(summary = "Funnel tab: visited → product → cart → checkout → order → paid → shipped")
    public MetricsDtos.Funnel funnel(@RequestParam(defaultValue = "month") String period,
                                     @RequestParam(required = false) String from,
                                     @RequestParam(required = false) String to,
                                     @RequestParam(defaultValue = "miniapp") String channel) {
        return metrics.funnel(period(period, from, to), ChannelFilter.parse(channel));
    }

    @GetMapping("/operations")
    @Operation(summary = "Operations tab: median/p90 speed, stuck orders, reject reasons, delivery/payment mix")
    public MetricsDtos.Operations operations(@RequestParam(defaultValue = "month") String period,
                                             @RequestParam(required = false) String from,
                                             @RequestParam(required = false) String to,
                                             @RequestParam(defaultValue = "all") String channel) {
        return metrics.operations(period(period, from, to), ChannelFilter.parse(channel));
    }

    @GetMapping("/forecast")
    @Operation(summary = "Revenue forecast for this month and the next 30 days, with backtest accuracy")
    public MetricsDtos.Forecast forecast(@RequestParam(defaultValue = "all") String channel) {
        return metrics.forecast(ChannelFilter.parse(channel));
    }

    @GetMapping("/today")
    @Operation(summary = "Board strip: work queues, today's money vs yesterday, products running out")
    public MetricsDtos.Today today() {
        return metrics.today();
    }

    private MetricsPeriod period(String token, String from, String to) {
        return metrics.period(token, from, to);
    }
}
