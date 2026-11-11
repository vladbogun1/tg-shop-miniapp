package com.maxsolch.shop.procurement.app;

import com.maxsolch.shop.catalog.app.Products;
import com.maxsolch.shop.catalog.domain.Product;
import com.maxsolch.shop.catalog.domain.ProductVariant;
import com.maxsolch.shop.inventory.app.LotLedger;
import com.maxsolch.shop.inventory.domain.StockLot;
import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.platform.util.UuidUtil;
import com.maxsolch.shop.procurement.app.CostingDtos.BatchLineOptionDto;
import com.maxsolch.shop.procurement.app.CostingDtos.LotCostRequest;
import com.maxsolch.shop.procurement.app.CostingDtos.LotSourceRequest;
import com.maxsolch.shop.procurement.app.CostingService.CostBook;
import com.maxsolch.shop.procurement.app.CostingService.UnitCost;
import com.maxsolch.shop.procurement.domain.PreorderBatch;
import com.maxsolch.shop.procurement.domain.PreorderBatchItem;
import com.maxsolch.shop.procurement.domain.ProcurementError;
import com.maxsolch.shop.procurement.infra.PreorderBatchItemRepository;
import com.maxsolch.shop.procurement.infra.PreorderBatchRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Where the units on the shelf came from (card of a product → «Склад по партиям»). Units the admin added by hand,
 * or the old stock, have no cost; here they either get attached to a line of an arrived batch (and sell at its
 * cost) or get a cost typed as purchase + delivery per unit. The shelf total never changes here.
 */
@Service
public class LotSources {

    /** What one call changed, for the journal. */
    public record Outcome(String productId, int units, String what) {
    }

    private final LotLedger ledger;
    private final CostingService costing;
    private final Products products;
    private final PreorderBatchItemRepository items;
    private final PreorderBatchRepository batches;

    public LotSources(LotLedger ledger, CostingService costing, Products products, PreorderBatchItemRepository items,
                      PreorderBatchRepository batches) {
        this.ledger = ledger;
        this.costing = costing;
        this.products = products;
        this.items = items;
        this.batches = batches;
    }

    /** Lines of arrived batches with this product, newest batch first; {@code lots} = the product's lots. */
    @Transactional(readOnly = true)
    public List<BatchLineOptionDto> batchLines(Product p, List<StockLot> lots) {
        List<PreorderBatchItem> lines = items.findByProductIdOrderByIdAsc(p.getId());
        if (lines.isEmpty()) {
            return List.of();
        }
        Map<Long, PreorderBatch> arrived = batches.findAllById(lines.stream().map(PreorderBatchItem::getBatchId)
                        .collect(Collectors.toSet())).stream()
                .filter(b -> b.getStatus() == PreorderBatch.Status.ARRIVED)
                .collect(Collectors.toMap(PreorderBatch::getId, Function.identity()));
        List<PreorderBatchItem> usable = lines.stream().filter(i -> arrived.containsKey(i.getBatchId())).toList();
        CostBook book = costing.bookOfItems(usable.stream().map(PreorderBatchItem::getId).toList());
        List<BatchLineOptionDto> out = new ArrayList<>();
        for (PreorderBatchItem i : usable) {
            PreorderBatch b = arrived.get(i.getBatchId());
            ProductVariant v = p.variant(i.getVariantId());
            int onLots = lots.stream().filter(l -> l.getBatchItemId() != null && l.getBatchItemId().equals(i.getId()))
                    .mapToInt(StockLot::getQtyIn).sum();
            UnitCost c = book.ofItem(i.getId());
            out.add(new BatchLineOptionDto(i.getId(), b.getId(), b.getTitle(),
                    i.getVariantId() == null ? null : UuidUtil.toString(i.getVariantId()), v == null ? null : v.getName(),
                    CostingService.qtyOf(i), onLots, c.minor(), c.preliminary(), b.getArrivedAt()));
        }
        out.sort(Comparator.comparing(BatchLineOptionDto::batchId).reversed());
        return out;
    }

    /** «Закупка» + «доставка» of one OPENING / MANUAL lot; purchase null clears the cost. */
    @Transactional
    public Outcome setLotCost(long lotId, LotCostRequest req) {
        StockLot lot = ledger.lotsByIds(List.of(lotId)).stream().findFirst()
                .orElseThrow(() -> new DomainException.NotFound(ProcurementError.LOT_NOT_FOUND));
        if (lot.batch()) {
            throw new DomainException.BadRequest(ProcurementError.LOT_IS_BATCH);
        }
        Long purchase = req == null ? null : req.purchaseMinor();
        Long extra = req == null ? null : req.extraMinor();
        price(lot, purchase, extra);
        ledger.saveLots(List.of(lot));
        return new Outcome(UuidUtil.toString(lot.getProductId()), lot.getQtyLeft(),
                "партия " + lotId + ": " + describe(purchase, extra));
    }

    /**
     * {@code qty} units without a cost (newest first) came from a batch line, or get the typed cost. Refused when
     * the product (variant) has fewer such units on the shelf.
     */
    @Transactional
    public Outcome assign(String productId, LotSourceRequest req) {
        if (req == null || req.qty() == null || req.qty() <= 0) {
            throw new DomainException.BadRequest(ProcurementError.BAD_QTY);
        }
        Product p = products.findByIdForUpdate(UuidUtil.toBytes(productId))
                .orElseThrow(() -> new DomainException.NotFound(ProcurementError.PRODUCT_NOT_FOUND));
        byte[] vid = req.variantId() == null || req.variantId().isBlank() ? null : UuidUtil.toBytes(req.variantId());
        List<StockLot> unpriced = ledger.lotsOfLine(p.getId(), vid).stream()
                .filter(l -> !l.batch() && l.getUnitCostMinor() == null && l.getQtyLeft() > 0)
                .sorted(Comparator.comparing(StockLot::getId).reversed())
                .toList();
        if (unpriced.stream().mapToInt(StockLot::getQtyLeft).sum() < req.qty()) {
            throw new DomainException.BadRequest(ProcurementError.NOT_ENOUGH_UNPRICED);
        }
        String what;
        if ("BATCH".equals(req.source())) {
            PreorderBatchItem line = arrivedLine(req.batchItemId(), p.getId(), vid);
            take(unpriced, req.qty(), (lot, n) -> ledger.reattach(lot, n, line.getId()));
            what = "из поставки " + line.getBatchId();
        } else if ("PRICE".equals(req.source())) {
            check(req.purchaseMinor(), req.extraMinor());
            take(unpriced, req.qty(), (lot, n) -> {
                StockLot part = n == lot.getQtyLeft() ? lot : ledger.split(lot, n);
                price(part, req.purchaseMinor(), req.extraMinor());
                ledger.saveLots(List.of(part));
            });
            what = describe(req.purchaseMinor(), req.extraMinor());
        } else {
            throw new DomainException.BadRequest(ProcurementError.BAD_KIND);
        }
        String note = req.note() == null || req.note().isBlank() ? "" : " · " + req.note().trim();
        return new Outcome(productId, req.qty(), req.qty() + " шт " + what + note);
    }

    private interface Move {
        void apply(StockLot lot, int units);
    }

    /** Walks the lots newest first, handing each up to the units still needed. */
    private static void take(List<StockLot> newestFirst, int qty, Move move) {
        int left = qty;
        for (StockLot lot : newestFirst) {
            if (left <= 0) {
                break;
            }
            int n = Math.min(lot.getQtyLeft(), left);
            move.apply(lot, n);
            left -= n;
        }
    }

    private PreorderBatchItem arrivedLine(Long batchItemId, byte[] productId, byte[] variantId) {
        PreorderBatchItem line = batchItemId == null ? null : items.findById(batchItemId).orElse(null);
        boolean same = line != null && Arrays.equals(line.getProductId(), productId)
                && Arrays.equals(line.getVariantId(), variantId);
        PreorderBatch b = same ? batches.findById(line.getBatchId()).orElse(null) : null;
        if (b == null || b.getStatus() != PreorderBatch.Status.ARRIVED) {
            throw new DomainException.BadRequest(ProcurementError.BAD_LOT_SOURCE);
        }
        return line;
    }

    private static void price(StockLot lot, Long purchase, Long extra) {
        if (purchase == null) {
            lot.setUnitCostMinor(null);
            lot.setUnitExtraMinor(null);
            return;
        }
        check(purchase, extra);
        lot.setUnitCostMinor(purchase + (extra == null ? 0 : extra));
        lot.setUnitExtraMinor(extra);
    }

    private static void check(Long purchase, Long extra) {
        if (purchase == null || purchase < 0 || (extra != null && extra < 0)) {
            throw new DomainException.BadRequest(ProcurementError.BAD_COST);
        }
    }

    private static String describe(Long purchase, Long extra) {
        if (purchase == null) {
            return "закупка очищена";
        }
        return "закупка " + purchase / 100.0 + " ₴" + (extra == null ? "" : " + доставка " + extra / 100.0 + " ₴");
    }
}
