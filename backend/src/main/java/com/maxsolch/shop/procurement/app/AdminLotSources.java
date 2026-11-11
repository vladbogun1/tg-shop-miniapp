package com.maxsolch.shop.procurement.app;

import com.maxsolch.shop.audit.app.AdminAuditService;
import com.maxsolch.shop.procurement.app.CostingDtos.LotCostRequest;
import com.maxsolch.shop.procurement.app.CostingDtos.LotSourceRequest;
import com.maxsolch.shop.procurement.app.CostingDtos.ProductCostDto;
import org.springframework.stereotype.Service;

/**
 * The buttons of «Склад по партиям» in a product card («Финансы» is checked on the controller): runs the
 * {@link LotSources} scenario, writes the journal entry once it has committed, answers with the fresh lots.
 */
@Service
public class AdminLotSources {

    private final LotSources sources;
    private final StockLotCosting lots;
    private final AdminAuditService audit;

    public AdminLotSources(LotSources sources, StockLotCosting lots, AdminAuditService audit) {
        this.sources = sources;
        this.lots = lots;
        this.audit = audit;
    }

    public ProductCostDto setLotCost(long lotId, LotCostRequest req) {
        LotSources.Outcome o = sources.setLotCost(lotId, req);
        audit.record("COSTING_LOT_COST", "PRODUCT", o.productId(), o.what());
        return lots.product(o.productId());
    }

    public ProductCostDto assign(String productId, LotSourceRequest req) {
        LotSources.Outcome o = sources.assign(productId, req);
        audit.record("COSTING_LOT_SOURCE", "PRODUCT", o.productId(), o.what());
        return lots.product(o.productId());
    }
}
