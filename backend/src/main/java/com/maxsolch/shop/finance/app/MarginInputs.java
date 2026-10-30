package com.maxsolch.shop.finance.app;

import com.maxsolch.shop.procurement.app.ProcurementSettings;
import com.maxsolch.shop.finance.domain.MarginRows.Bundle;
import com.maxsolch.shop.finance.infra.MarginQueries;
import com.maxsolch.shop.inventory.app.LotLedger;
import com.maxsolch.shop.inventory.domain.StockLot;
import com.maxsolch.shop.settings.app.SettingsService;
import com.maxsolch.shop.procurement.app.CostingService;
import com.maxsolch.shop.procurement.app.CostingService.CostBook;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

/** What every margin report needs before the math: the orders, the lots they came from, their price book, the fee. */
@Component
class MarginInputs {

    private final MarginQueries queries;
    private final CostingService costing;
    private final LotLedger ledger;
    private final SettingsService settings;

    MarginInputs(MarginQueries queries, CostingService costing, LotLedger ledger, SettingsService settings) {
        this.queries = queries;
        this.costing = costing;
        this.ledger = ledger;
        this.settings = settings;
    }

    Map<String, Bundle> bundles(Collection<String> orderIds) {
        return queries.bundles(orderIds);
    }

    CostBook bookFor(Collection<Bundle> bundles, Collection<StockLot> extra) {
        List<StockLot> all = new ArrayList<>(ledger.lotsByIds(lotIds(bundles)));
        all.addAll(extra);
        return costing.book(all);
    }

    Map<Long, StockLot> lotsById(Collection<Bundle> bundles) {
        return ledger.lotsByIds(lotIds(bundles)).stream()
                .collect(Collectors.toMap(StockLot::getId, Function.identity()));
    }

    BigDecimal feePercent() {
        return settings.getDecimal(ProcurementSettings.COSTING_ACQUIRING_FEE_PERCENT);
    }

    private static Set<Long> lotIds(Collection<Bundle> bundles) {
        Set<Long> ids = new HashSet<>();
        bundles.forEach(b -> b.allocs().values().forEach(l -> l.forEach(a -> ids.add(a.lotId()))));
        return ids;
    }
}
