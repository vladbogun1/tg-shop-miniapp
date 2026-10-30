package com.maxsolch.shop.finance.app;

import com.maxsolch.shop.analytics.app.MetricsFactsLoader;
import com.maxsolch.shop.analytics.domain.MetricsFacts;
import com.maxsolch.shop.catalog.domain.Product;
import com.maxsolch.shop.catalog.domain.ProductVariant;
import com.maxsolch.shop.finance.domain.MarginRows.Alloc;
import com.maxsolch.shop.finance.domain.MarginRows.Bundle;
import com.maxsolch.shop.finance.domain.MarginRows.LineMoney;
import com.maxsolch.shop.finance.domain.MarginRows.OrderProfit;
import com.maxsolch.shop.finance.infra.MarginQueries;
import com.maxsolch.shop.inventory.app.LotLedger;
import com.maxsolch.shop.inventory.domain.StockLot;
import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.platform.util.UuidUtil;
import com.maxsolch.shop.procurement.app.BatchCatalog;
import com.maxsolch.shop.procurement.app.CostingDtos.BatchSalesDto;
import com.maxsolch.shop.procurement.app.CostingDtos.BatchSalesLineDto;
import com.maxsolch.shop.procurement.app.CostingService;
import com.maxsolch.shop.procurement.app.CostingService.CostBook;
import com.maxsolch.shop.procurement.app.CostingService.UnitCost;
import com.maxsolch.shop.procurement.app.LineProducts;
import com.maxsolch.shop.procurement.domain.Lines;
import com.maxsolch.shop.procurement.domain.PreorderBatch;
import com.maxsolch.shop.procurement.domain.PreorderBatchItem;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * P&amp;L of one purchase batch (§5А.3): what was spent, what its units sold for and cost, what is left on the shelf.
 * The order math is {@link MarginMath}; inputs are shared with {@link MarginService} through {@link MarginInputs}.
 */
@Service
public class BatchMarginService {

    private final MarginInputs inputs;
    private final MarginQueries queries;
    private final CostingService costing;
    private final LotLedger ledger;
    private final BatchCatalog batches;
    private final LineProducts queue;
    private final MetricsFactsLoader facts;

    BatchMarginService(MarginInputs inputs, MarginQueries queries, CostingService costing, LotLedger ledger,
                       BatchCatalog batches, LineProducts queue, MetricsFactsLoader facts) {
        this.inputs = inputs;
        this.queries = queries;
        this.costing = costing;
        this.ledger = ledger;
        this.batches = batches;
        this.queue = queue;
        this.facts = facts;
    }

    @Transactional(readOnly = true)
    public BatchSalesDto batch(long batchId) {
        PreorderBatch pb = batches.find(batchId).orElseThrow(() -> new DomainException.NotFound("Поставка не найдена"));
        List<PreorderBatchItem> lines = batches.linesOf(batchId);
        List<StockLot> batchLots = ledger.lotsOfBatchItems(lines.stream().map(PreorderBatchItem::getId).toList());
        CostBook book = costing.book(batchLots);
        Map<Long, StockLot> lotById = batchLots.stream().collect(Collectors.toMap(StockLot::getId, Function.identity()));

        Map<String, Bundle> bundles = Map.of();
        if (!lotById.isEmpty()) {
            List<String> orderIds = queries.orderIdsOfLots(lotById.keySet());
            bundles = inputs.bundles(orderIds);
        }
        Set<String> soldIds = bundles.isEmpty() ? Set.of() : facts.load().orders().stream()
                .filter(MetricsFacts.OrderFact::sold).map(MetricsFacts.OrderFact::id).collect(Collectors.toSet());
        Map<Long, StockLot> allLots = new HashMap<>(inputs.lotsById(bundles.values()));
        CostBook full = inputs.bookFor(bundles.values(), batchLots);

        Map<Long, long[]> perLine = new HashMap<>(); // itemId → {sold, revenue, cost, reserved}
        Instant last = null;
        for (Bundle b : bundles.values()) {
            if (!soldIds.contains(b.order().id())) {
                // awaiting online payment: off the shelf, but not a sale yet
                b.allocs().values().forEach(al -> al.forEach(a -> {
                    StockLot lot = lotById.get(a.lotId());
                    if (lot != null) {
                        perLine.computeIfAbsent(lot.getBatchItemId(), k -> new long[4])[3] += a.qty();
                    }
                }));
                continue;
            }
            OrderProfit m = MarginMath.compute(b, id -> full.of(allLots.get(id)), inputs.feePercent());
            for (LineMoney l : m.lines()) {
                int out = Math.max(1, l.item().unitsOut());
                for (Alloc a : l.allocs()) {
                    StockLot lot = lotById.get(a.lotId());
                    if (lot == null) {
                        continue;
                    }
                    UnitCost u = book.of(lot);
                    long[] s = perLine.computeIfAbsent(lot.getBatchItemId(), k -> new long[4]);
                    s[0] += a.qty();
                    s[1] += l.revenue() * a.qty() / out;
                    s[2] += u.minor() == null ? 0 : u.minor() * a.qty();
                    if (a.at() != null && (last == null || a.at().isAfter(last))) {
                        last = a.at();
                    }
                }
            }
        }
        Map<String, Product> products = queue.productsOf(lines.stream().map(PreorderBatchItem::getProductId).toList());
        List<BatchSalesLineDto> out = new ArrayList<>();
        long spent = 0;
        long revenue = 0;
        long costSold = 0;
        long leftValue = 0;
        int arrived = 0;
        int sold = 0;
        int left = 0;
        int reserved = 0;
        boolean preliminary = false;
        for (PreorderBatchItem i : lines) {
            Product p = products.get(UuidUtil.toString(i.getProductId()));
            ProductVariant v = p == null ? null : Lines.variantById(p, i.getVariantId());
            int in = i.getQtyArrived() == null ? 0 : i.getQtyArrived();
            int l = batchLots.stream().filter(x -> x.getBatchItemId().equals(i.getId()))
                    .mapToInt(StockLot::getQtyLeft).sum();
            UnitCost u = batchLots.stream().filter(x -> x.getBatchItemId().equals(i.getId())).findFirst()
                    .map(book::of).orElse(new UnitCost(null, false));
            long[] s = perLine.getOrDefault(i.getId(), new long[4]);
            long unit = u.minor() == null ? 0 : u.minor();
            spent += unit * in;
            revenue += s[1];
            costSold += s[2];
            leftValue += unit * l;
            arrived += in;
            sold += (int) s[0];
            left += l;
            reserved += (int) s[3];
            preliminary |= u.preliminary() || (u.minor() == null && in > 0);
            out.add(new BatchSalesLineDto(i.getId(), p == null ? "(товар удалён)" : p.getTitle(),
                    v == null ? null : v.getName(), in, (int) s[0], (int) s[3], l, u.minor(), s[1], s[2],
                    s[1] - s[2]));
        }
        Instant soldOut = arrived > 0 && left == 0 && reserved == 0 ? last : null;
        Integer days = soldOut != null && pb.getArrivedAt() != null
                ? (int) Math.max(0, Duration.between(pb.getArrivedAt(), soldOut).toDays()) : null;
        long profit = revenue - costSold;
        return new BatchSalesDto(batchId, spent, revenue, costSold, profit,
                revenue > 0 ? CostingService.pct(profit, revenue) : null, arrived, sold, reserved, left, leftValue,
                pb.getArrivedAt(), soldOut, days, preliminary, out);
    }
}
