package com.maxsolch.shop.finance.app;

import com.maxsolch.shop.analytics.app.MetricsFactsLoader;
import com.maxsolch.shop.analytics.domain.MetricsFacts;
import com.maxsolch.shop.analytics.domain.MetricsPeriod;
import com.maxsolch.shop.finance.domain.MarginRows.Alloc;
import com.maxsolch.shop.finance.domain.MarginRows.Bundle;
import com.maxsolch.shop.finance.domain.MarginRows.ItemRow;
import com.maxsolch.shop.finance.domain.MarginRows.LineMoney;
import com.maxsolch.shop.finance.domain.MarginRows.OrderProfit;
import com.maxsolch.shop.finance.infra.MarginQueries;
import com.maxsolch.shop.inventory.app.LotLedger;
import com.maxsolch.shop.inventory.domain.StockLot;
import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.procurement.app.CostingDtos.MarginReportDto;
import com.maxsolch.shop.procurement.app.CostingDtos.OrderLineCostDto;
import com.maxsolch.shop.procurement.app.CostingDtos.OrderProfitDto;
import com.maxsolch.shop.procurement.app.CostingService;
import com.maxsolch.shop.procurement.app.CostingService.CostBook;
import com.maxsolch.shop.procurement.app.CostingService.UnitCost;
import com.maxsolch.shop.procurement.domain.PreorderBatch;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Margin (§5А.3): profit of an order and «Метрики → Маржа». Revenue is what the order
 * keeps (total − refunds − not collected), split over its lines by price; cost of goods comes from the lots
 * each unit left (FIFO), priced now — an expense typed after the sale re-prices it. The acquiring fee is the
 * bank's own ({@code payment_invoices.fee_minor}), {@code costing.acquiringFeePercent} (1,3 %) when monobank
 * sent none. The P&amp;L of a batch is {@link BatchMarginService}.
 */
@Service
public class MarginService {

    private final MarginInputs inputs;
    private final MarginQueries queries;
    private final LotLedger ledger;
    private final MetricsFactsLoader facts;

    MarginService(MarginInputs inputs, MarginQueries queries, LotLedger ledger, MetricsFactsLoader facts) {
        this.inputs = inputs;
        this.queries = queries;
        this.ledger = ledger;
        this.facts = facts;
    }

    @Transactional(readOnly = true)
    public OrderProfitDto order(String orderId) {
        Bundle b = inputs.bundles(List.of(orderId)).get(orderId);
        if (b == null) {
            throw new DomainException.NotFound("Заказ не найден");
        }
        CostBook book = inputs.bookFor(List.of(b), List.of());
        Map<Long, StockLot> byId = inputs.lotsById(List.of(b));
        OrderProfit m = MarginMath.compute(b, id -> book.of(byId.get(id)), inputs.feePercent());
        List<OrderLineCostDto> lines = m.lines().stream().map(l -> new OrderLineCostDto(l.item().id(),
                l.item().title(), l.item().variantName(), l.item().gift(), l.item().unitsOut(), l.revenue(),
                l.cost(), l.unknownUnits(), l.preliminary())).toList();
        return new OrderProfitDto(orderId, m.revenue(), m.cost(), m.fee(), m.feeEstimated(), m.profit(),
                m.revenue() > 0 ? CostingService.pct(m.profit(), m.revenue()) : null, m.complete(),
                m.preliminary(), lines);
    }

    @Transactional(readOnly = true)
    public MarginReportDto report(MetricsPeriod period) {
        MetricsFacts f = facts.load();
        List<String> ids = f.orders().stream()
                .filter(o -> o.sold() && period.contains(o.createdAt()))
                .map(MetricsFacts.OrderFact::id)
                .toList();
        Map<String, Bundle> bundles = inputs.bundles(ids);
        List<StockLot> shelf = ledger.lotsOnShelf();
        Map<Long, StockLot> lotById = new HashMap<>(inputs.lotsById(bundles.values()));
        shelf.forEach(l -> lotById.put(l.getId(), l));
        CostBook book = inputs.bookFor(bundles.values(), shelf);

        Map<String, String[]> catalog = queries.brandAndCategoryByProduct();
        MarginAgg byProduct = new MarginAgg();
        MarginAgg byBrand = new MarginAgg();
        MarginAgg byCategory = new MarginAgg();
        MarginAgg byBatch = new MarginAgg();
        long revenue = 0;
        long known = 0;
        long cost = 0;
        long fee = 0;
        long gifts = 0;
        for (Bundle b : bundles.values()) {
            OrderProfit m = MarginMath.compute(b, id -> book.of(lotById.get(id)), inputs.feePercent());
            revenue += m.revenue();
            if (m.complete()) {
                known += m.revenue();
                cost += m.cost();
                fee += m.fee();
                gifts += m.lines().stream().filter(l -> l.item().gift()).mapToLong(LineMoney::cost).sum();
            }
            for (LineMoney l : m.lines()) {
                ItemRow i = l.item();
                String[] cat = catalog.getOrDefault(i.productId(), new String[] {"—", "—"});
                boolean ok = l.unknownUnits() == 0;
                int units = i.gift() ? 0 : i.soldUnits();
                byProduct.add(i.productId(), i.title(), units, l.revenue(), l.cost(), ok);
                byBrand.add(cat[0], cat[0], units, l.revenue(), l.cost(), ok);
                byCategory.add(cat[1], cat[1], units, l.revenue(), l.cost(), ok);
                int out = Math.max(1, i.unitsOut());
                for (Alloc a : l.allocs()) {
                    StockLot lot = lotById.get(a.lotId());
                    PreorderBatch pb = book.batchOf(lot);
                    UnitCost u = book.of(lot);
                    String key = pb == null ? "opening" : "b" + pb.getId();
                    String label = pb == null ? "Старый остаток" : pb.getTitle();
                    long rev = l.revenue() * a.qty() / out;
                    byBatch.add(key, label, i.gift() ? 0 : a.qty(), rev, u.minor() == null ? 0 : u.minor() * a.qty(),
                            u.minor() != null);
                }
            }
        }
        long stockValue = 0;
        int stockUnits = 0;
        int stockUnknown = 0;
        for (StockLot l : shelf) {
            UnitCost u = book.of(l);
            stockUnits += l.getQtyLeft();
            if (u.minor() == null) {
                stockUnknown += l.getQtyLeft();
            } else {
                stockValue += u.minor() * l.getQtyLeft();
            }
        }
        long profit = known - cost - fee;
        return new MarginReportDto(period.from(), period.to(), revenue, known,
                revenue > 0 ? Math.round(known * 1000.0 / revenue) / 1000.0 : null, cost, fee, gifts, profit,
                known > 0 ? CostingService.pct(profit, known) : null, stockValue, stockUnits, stockUnknown,
                byProduct.rows(50), byBrand.rows(30), byCategory.rows(30), byBatch.rows(30));
    }
}
