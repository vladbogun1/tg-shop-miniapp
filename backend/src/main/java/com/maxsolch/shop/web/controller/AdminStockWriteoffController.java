package com.maxsolch.shop.web.controller;

import com.maxsolch.shop.platform.audit.AdminAuditService;
import com.maxsolch.shop.platform.security.RequiredAdmin;
import com.maxsolch.shop.returns.app.DefectWriteoffs;
import com.maxsolch.shop.service.StockWriteoffReportService;
import com.maxsolch.shop.order.domain.TimeRange;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import com.maxsolch.shop.returns.api.ReturnDtos;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
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
    private final DefectWriteoffs defects;
    private final AdminAuditService audit;

    public AdminStockWriteoffController(StockWriteoffReportService reports, DefectWriteoffs defects,
                                        AdminAuditService audit) {
        this.reports = reports;
        this.defects = defects;
        this.audit = audit;
    }

    @PostMapping("/{id}/restore")
    @Operation(summary = "Written off by mistake: put units back on the shelf (the write-off is kept, marked)")
    public java.util.Map<String, String> restore(@PathVariable long id,
                                                 @Valid @RequestBody ReturnDtos.RestoreWriteoffRequest req) {
        String summary = defects.restore(id, req.quantity(), req.note(), audit.currentAdminName());
        audit.record("STOCK_WRITEOFF_RESTORE", "STOCK_WRITEOFF", String.valueOf(id), summary);
        return java.util.Map.of("summary", summary);
    }

    @GetMapping
    @Operation(summary = "Write-offs for a period (week | month | halfyear | year | all) with totals per reason")
    public StockWriteoffReportService.Report list(@RequestParam(defaultValue = "month") String range) {
        return reports.report(TimeRange.parse(range));
    }
}
