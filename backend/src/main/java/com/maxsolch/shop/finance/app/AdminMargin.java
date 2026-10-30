package com.maxsolch.shop.finance.app;

import com.maxsolch.shop.analytics.app.AdminMetricsService;
import com.maxsolch.shop.procurement.app.CostingDtos.BatchSalesDto;
import com.maxsolch.shop.procurement.app.CostingDtos.MarginReportDto;
import com.maxsolch.shop.procurement.app.CostingDtos.OrderProfitDto;
import org.springframework.stereotype.Service;

/**
 * The margin screens of the finance admin: P&amp;L of a batch, profit of an order, the report «Метрики → Маржа».
 * The «Финансы» right is checked by {@code @RequiresFinance} on the controller; the numbers come from {@link MarginService}.
 */
@Service
public class AdminMargin {

    private final MarginService margin;
    private final BatchMarginService batchMargin;
    private final AdminMetricsService metrics;

    public AdminMargin(MarginService margin, BatchMarginService batchMargin, AdminMetricsService metrics) {
        this.margin = margin;
        this.batchMargin = batchMargin;
        this.metrics = metrics;
    }

    public BatchSalesDto batch(long batchId) {
        return batchMargin.batch(batchId);
    }

    public OrderProfitDto order(String orderId) {
        return margin.order(orderId);
    }

    public MarginReportDto report(String period, String from, String to) {
        return margin.report(metrics.period(period, from, to));
    }
}
