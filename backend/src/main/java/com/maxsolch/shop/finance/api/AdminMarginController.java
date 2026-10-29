package com.maxsolch.shop.finance.api;

import com.maxsolch.shop.finance.app.AdminMargin;
import com.maxsolch.shop.platform.security.RequiredAdmin;
import com.maxsolch.shop.procurement.app.CostingDtos.BatchSalesDto;
import com.maxsolch.shop.procurement.app.CostingDtos.MarginReportDto;
import com.maxsolch.shop.procurement.app.CostingDtos.OrderProfitDto;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Margin: P&amp;L of a batch, profit of an order, the report. Same prefix as the purchase side
 * ({@code procurement.api.AdminCostingController}); for the main admin and admins with «Финансы».
 */
@RestController
@RequestMapping("/api/admin/costing")
@RequiredAdmin
@Tag(name = "Admin Costing", description = "Batch money, FIFO cost of goods, margin")
@SecurityRequirement(name = "bearer-jwt")
public class AdminMarginController {

    private final AdminMargin margin;

    public AdminMarginController(AdminMargin margin) {
        this.margin = margin;
    }

    @GetMapping("/batches/{id}/sales")
    @Operation(summary = "P&L of the batch: spent, sold, profit, left on the shelf, days to sell out")
    public BatchSalesDto sales(@PathVariable long id) {
        return margin.batch(id);
    }

    @GetMapping("/orders/{orderId}")
    @Operation(summary = "Profit of an order: revenue − cost of goods − acquiring fee")
    public OrderProfitDto order(@PathVariable String orderId) {
        return margin.order(orderId);
    }

    @GetMapping("/report")
    @Operation(summary = "«Метрики → Маржа»: revenue, cost, profit, by product / brand / category / batch")
    public MarginReportDto report(@RequestParam(defaultValue = "month") String period,
                                  @RequestParam(required = false) String from,
                                  @RequestParam(required = false) String to) {
        return margin.report(period, from, to);
    }
}
