package com.maxsolch.shop.web.controller;

import com.maxsolch.shop.security.RequiredAdmin;
import com.maxsolch.shop.service.StockWriteoffReportService;
import com.maxsolch.shop.service.TimeRange;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/admin/stock-writeoffs")
@RequiredAdmin
@Tag(name = "Admin Stock Writeoffs", description = "Stock that left the shelf without a sale")
@SecurityRequirement(name = "bearer-jwt")
public class AdminStockWriteoffController {

    private final StockWriteoffReportService reports;

    public AdminStockWriteoffController(StockWriteoffReportService reports) {
        this.reports = reports;
    }

    @GetMapping
    @Operation(summary = "Write-offs for a period (week | month | halfyear | year | all) with totals per reason")
    public StockWriteoffReportService.Report list(@RequestParam(defaultValue = "month") String range) {
        return reports.report(TimeRange.parse(range));
    }
}
