package com.maxsolch.shop.procurement.app;

import static com.maxsolch.shop.procurement.app.CostingService.pct;

import com.maxsolch.shop.catalog.app.Products;
import com.maxsolch.shop.catalog.domain.Product;
import com.maxsolch.shop.catalog.domain.ProductVariant;
import com.maxsolch.shop.inventory.app.LotLedger;
import com.maxsolch.shop.inventory.domain.StockLot;
import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.platform.util.UuidUtil;
import com.maxsolch.shop.procurement.app.CostingDtos.LotDto;
import com.maxsolch.shop.procurement.app.CostingDtos.OpeningRequest;
import com.maxsolch.shop.procurement.app.CostingDtos.OpeningRowDto;
import com.maxsolch.shop.procurement.app.CostingDtos.ProductCostDto;
import com.maxsolch.shop.procurement.app.CostingDtos.ReconcileDto;
import com.maxsolch.shop.procurement.app.CostingService.CostBook;
import com.maxsolch.shop.procurement.app.CostingService.UnitCost;
import com.maxsolch.shop.procurement.domain.Lines;
import com.maxsolch.shop.procurement.domain.PreorderBatch;
import com.maxsolch.shop.procurement.domain.ProcurementError;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * The cost side of the stock lots (§5А.1): a product's lots with their unit costs, «Начальная себестоимость»
 * of the old stock, «Выровнять» lots with the stock. The batch money is {@link CostingService}.
 */
@Service
public class StockLotCosting {

    private final CostingService costing;
    private final Products products;
    private final LineProducts queue;
    private final LotLedger ledger;

    public StockLotCosting(CostingService costing, Products products, LineProducts queue, LotLedger ledger) {
        this.costing = costing;
        this.products = products;
        this.queue = queue;
        this.ledger = ledger;
    }

    @Transactional(readOnly = true)
    public ProductCostDto product(String productId) {
        Product p = products.findById(UuidUtil.toBytes(productId))
                .orElseThrow(() -> new DomainException.NotFound(ProcurementError.PRODUCT_NOT_FOUND));
        List<StockLot> all = ledger.lotsOfProduct(p.getId());
        CostBook book = costing.book(all);
        List<LotDto> out = new ArrayList<>();
        StockLot next = null;
        for (StockLot l : all) {
            if (l.getQtyLeft() <= 0 && l.getQtyIn() <= 0) {
                continue;
            }
            ProductVariant v = Lines.variantById(p, l.getVariantId());
            UnitCost c = book.of(l);
            PreorderBatch b = book.batchOf(l);
            out.add(new LotDto(l.getId(), l.getVariantId() == null ? null : UuidUtil.toString(l.getVariantId()),
                    v == null ? null : v.getName(), l.getKind(), b == null ? null : b.getId(),
                    b == null ? null : b.getTitle(), l.getQtyIn(), l.getQtyLeft(), c.minor(), c.preliminary(),
                    l.getCreatedAt()));
            if (next == null && l.getQtyLeft() > 0) {
                next = l;
            }
        }
        UnitCost cur = book.of(next);
        long price = p.getPriceMinor();
        Long margin = cur.minor() == null || price <= 0 ? null : price - cur.minor();
        int onLots = all.stream().mapToInt(StockLot::getQtyLeft).sum();
        return new ProductCostDto(UuidUtil.toString(p.getId()), price, cur.minor(),
                next == null ? null : cur.preliminary(), margin, margin == null ? null : pct(margin, price),
                margin == null || cur.minor() <= 0 ? null : pct(margin, cur.minor()), p.getStock(), onLots, out);
    }

    /** Units on the shelf without a known cost (OPENING / MANUAL lots), one row per product (variant). */
    @Transactional(readOnly = true)
    public List<OpeningRowDto> opening() {
        Map<String, int[]> units = new LinkedHashMap<>();
        Map<String, Long> cost = new HashMap<>();
        Map<String, StockLot> sample = new HashMap<>();
        for (StockLot l : ledger.lotsOnShelf()) {
            if (l.batch()) {
                continue;
            }
            String key = Lines.key(l.getProductId(), l.getVariantId());
            units.computeIfAbsent(key, k -> new int[1])[0] += l.getQtyLeft();
            if (l.getUnitCostMinor() != null) {
                cost.put(key, l.getUnitCostMinor());
            }
            sample.putIfAbsent(key, l);
        }
        Map<String, Product> byId = queue.productsOf(sample.values().stream().map(StockLot::getProductId).toList());
        List<OpeningRowDto> out = new ArrayList<>();
        units.forEach((key, n) -> {
            StockLot l = sample.get(key);
            Product p = byId.get(UuidUtil.toString(l.getProductId()));
            if (p == null || p.isArchived()) {
                return;
            }
            ProductVariant v = Lines.variantById(p, l.getVariantId());
            out.add(new OpeningRowDto(UuidUtil.toString(p.getId()),
                    l.getVariantId() == null ? null : UuidUtil.toString(l.getVariantId()), p.getTitle(),
                    v == null ? null : v.getName(), Lines.imageOf(p), n[0], cost.get(key),
                    p.getPriceMinor()));
        });
        out.sort(Comparator.comparing(OpeningRowDto::title, String.CASE_INSENSITIVE_ORDER)
                .thenComparing(r -> r.variantName() == null ? "" : r.variantName()));
        return out;
    }

    /** The admin types the cost of the old stock of one product (variant); null clears it. */
    @Transactional
    public void setOpening(OpeningRequest req) {
        if (req == null || req.productId() == null) {
            throw new DomainException.BadRequest(ProcurementError.PRODUCT_REQUIRED);
        }
        if (req.unitCostMinor() != null && req.unitCostMinor() < 0) {
            throw new DomainException.BadRequest(ProcurementError.BAD_COST);
        }
        byte[] pid = UuidUtil.toBytes(req.productId());
        byte[] vid = req.variantId() == null || req.variantId().isBlank() ? null : UuidUtil.toBytes(req.variantId());
        List<StockLot> key = ledger.lotsOfLine(pid, vid).stream().filter(l -> !l.batch()).toList();
        if (key.isEmpty()) {
            throw new DomainException.NotFound(ProcurementError.NO_OLD_STOCK);
        }
        key.forEach(l -> l.setUnitCostMinor(req.unitCostMinor()));
        ledger.saveLots(key);
    }

    /** «Выровнять»: every product's lots match its stock again (drift from before the ledger, SQL fixes). */
    @Transactional
    public ReconcileDto reconcile() {
        Map<String, Integer> onLots = new HashMap<>();
        for (StockLot l : ledger.allLots()) {
            onLots.merge(Lines.key(l.getProductId(), l.getVariantId()), l.getQtyLeft(),
                    Integer::sum);
        }
        int keys = 0;
        List<String> details = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        for (Product p : products.findAll()) {
            boolean variants = p.getVariants() != null && !p.getVariants().isEmpty();
            boolean drift = false;
            if (variants) {
                for (ProductVariant v : p.getVariants()) {
                    String key = Lines.key(p.getId(), v.getId());
                    seen.add(key);
                    keys++;
                    if (onLots.getOrDefault(key, 0) != v.getStock()) {
                        drift = true;
                        details.add(p.getTitle() + " (" + v.getName() + "): партии " + onLots.getOrDefault(key, 0)
                                + " → склад " + v.getStock());
                    }
                }
            } else {
                String key = Lines.key(p.getId(), null);
                seen.add(key);
                keys++;
                if (onLots.getOrDefault(key, 0) != p.getStock()) {
                    drift = true;
                    details.add(p.getTitle() + ": партии " + onLots.getOrDefault(key, 0) + " → склад " + p.getStock());
                }
            }
            if (drift) {
                ledger.syncProduct(p);
            }
        }
        return new ReconcileDto(keys, details.size(), details.size() > 50 ? details.subList(0, 50) : details);
    }
}
