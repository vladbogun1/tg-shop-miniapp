package com.maxsolch.shop.finance.app;

import com.maxsolch.shop.analytics.app.AdminMetricsService;
import com.maxsolch.shop.platform.security.AdminAccess;
import com.maxsolch.shop.platform.web.CurrentActor;
import com.maxsolch.shop.procurement.app.CostingDtos.BatchSalesDto;
import com.maxsolch.shop.procurement.app.CostingDtos.MarginReportDto;
import com.maxsolch.shop.procurement.app.CostingDtos.OrderProfitDto;
import org.springframework.stereotype.Service;

/**
 * The margin screens of the finance admin: P&amp;L of a batch, profit of an order, the report «Метрики → Маржа».
 * Every call checks the «Финансы» right first; the numbers come from {@link MarginService}.
 */
@Service
public class AdminMargin {

    private final MarginService margin;
    private final BatchMarginService batchMargin;
    private final AdminMetricsService metrics;
    private final AdminAccess access;
    private final CurrentActor actor;

    public AdminMargin(MarginService margin, BatchMarginService batchMargin, AdminMetricsService metrics,
                       AdminAccess access, CurrentActor actor) {
        this.margin = margin;
        this.batchMargin = batchMargin;
        this.metrics = metrics;
        this.access = access;
        this.actor = actor;
    }

    public BatchSalesDto batch(long batchId) {
        access.requireFinance(actor.userId());
        return batchMargin.batch(batchId);
    }

    public OrderProfitDto order(String orderId) {
        access.requireFinance(actor.userId());
        return margin.order(orderId);
    }

    public MarginReportDto report(String period, String from, String to) {
        access.requireFinance(actor.userId());
        return margin.report(metrics.period(period, from, to));
    }
}
