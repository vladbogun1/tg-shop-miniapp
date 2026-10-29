package com.maxsolch.shop.inventory.app;

import com.maxsolch.shop.inventory.domain.StockLot;
import com.maxsolch.shop.inventory.infra.StockLotRepository;
import com.maxsolch.shop.inventory.domain.LotAllocations;
import com.maxsolch.shop.inventory.infra.StockLotRepository;
import com.maxsolch.shop.domain.Product;
import com.maxsolch.shop.domain.ProductVariant;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.util.Arrays;
import java.util.Collection;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * FIFO stock lots (docs/PREORDERS-PLAN.md §5А.2). Called wherever {@code stock} moves, inside the same
 * transaction and under the same product lock ({@code findByIdForUpdate}), so the lots of one product never
 * interleave. It never refuses anything: the stock rules stay in {@code OrderStock}; a unit the lots do not
 * cover (stock that drifted before the ledger) is simply sold «без данных».
 */
@Component
public class LotLedger {

    private final StockLotRepository lots;
    private final Clock clock;

    public LotLedger(StockLotRepository lots, Clock clock) {
        this.lots = lots;
        this.clock = clock;
    }

    /**
     * {@code qty} units leave the shelf, oldest lot first. With an order line they are recorded on it
     * (cost of that sale); without one (stock lowered by hand) they are just gone.
     */
    public void take(byte[] productId, byte[] variantId, int qty, LotAllocations sale) {
        int left = qty;
        for (StockLot lot : lots.findKey(productId, variantId)) {
            if (left <= 0) {
                break;
            }
            int n = Math.min(lot.getQtyLeft(), left);
            if (n <= 0) {
                continue;
            }
            lot.setQtyLeft(lot.getQtyLeft() - n);
            lots.save(lot);
            left -= n;
            if (sale != null) {
                sale.add(lot.getId(), n, clock.instant());
            }
        }
    }

    /**
     * {@code qty} units come back on the shelf. From an order line they return to the lots they came from,
     * newest allocation first (the units still sold keep the oldest cost); anything the line cannot account
     * for goes to the opening lot (cost unknown).
     */
    public void give(byte[] productId, byte[] variantId, int qty, LotAllocations sale) {
        int left = qty;
        if (sale != null) {
            List<LotAllocations.Share> shares = sale.shares();
            for (int i = shares.size() - 1; i >= 0 && left > 0; i--) {
                LotAllocations.Share a = shares.get(i);
                StockLot lot = lots.findById(a.lotId()).orElse(null);
                if (lot == null) {
                    continue;
                }
                int n = Math.min(a.qty(), left);
                lot.setQtyLeft(lot.getQtyLeft() + n);
                lots.save(lot);
                sale.reduceAt(i, n);
                left -= n;
            }
        }
        if (left > 0) {
            StockLot opening = lots.findKey(productId, variantId).stream()
                    .filter(l -> StockLot.Kind.OPENING.name().equals(l.getKind()))
                    .findFirst()
                    .orElseGet(() -> newLot(productId, variantId, StockLot.Kind.OPENING, 0));
            opening.setQtyLeft(opening.getQtyLeft() + left);
            opening.setQtyIn(Math.max(opening.getQtyIn(), opening.getQtyLeft()));
            lots.save(opening);
        }
    }

    /** An arrival of a batch line: a new lot whose cost comes from the batch. */
    public StockLot receive(byte[] productId, byte[] variantId, long batchItemId, int qty) {
        StockLot lot = newLot(productId, variantId, StockLot.Kind.BATCH, qty);
        lot.setBatchItemId(batchItemId);
        return lots.save(lot);
    }

    /**
     * After the admin edits a product: every lot key matches the stock again — a raise becomes a MANUAL lot
     * (cost unknown), a cut leaves the oldest lots, lots of removed variants are emptied.
     */
    public void syncProduct(Product p) {
        boolean variants = p.getVariants() != null && !p.getVariants().isEmpty();
        Set<String> live = new HashSet<>();
        if (variants) {
            for (ProductVariant v : p.getVariants()) {
                if (v.getId() != null) {
                    sync(p.getId(), v.getId(), v.getStock());
                    live.add(Arrays.toString(v.getId()));
                }
            }
        } else {
            sync(p.getId(), null, p.getStock());
        }
        for (StockLot lot : lots.findByProductIdOrderByIdAsc(p.getId())) {
            boolean stale = variants
                    ? lot.getVariantId() == null || !live.contains(Arrays.toString(lot.getVariantId()))
                    : lot.getVariantId() != null;
            if (stale && lot.getQtyLeft() != 0) {
                lot.setQtyLeft(0);
                lots.save(lot);
            }
        }
    }

    /** Σ qtyLeft of one key becomes {@code stock}. */
    public void sync(byte[] productId, byte[] variantId, int stock) {
        int onLots = lots.findKey(productId, variantId).stream().mapToInt(StockLot::getQtyLeft).sum();
        int diff = Math.max(0, stock) - onLots;
        if (diff > 0) {
            lots.save(newLot(productId, variantId, StockLot.Kind.MANUAL, diff));
        } else if (diff < 0) {
            take(productId, variantId, -diff, null);
        }
    }

    // ------------------------------------------------------------------ reads for procurement and finance

    /** Lots of one product (all variants), oldest first. */
    public List<StockLot> lotsOfProduct(byte[] productId) {
        return lots.findByProductIdOrderByIdAsc(productId);
    }

    /** Lots of one product (variant), oldest first; {@code variantId} null = a product without variants. */
    public List<StockLot> lotsOfLine(byte[] productId, byte[] variantId) {
        return lots.findKey(productId, variantId);
    }

    /** Lots with units still on the shelf. */
    public List<StockLot> lotsOnShelf() {
        return lots.findByQtyLeftGreaterThan(0);
    }

    public List<StockLot> allLots() {
        return lots.findAll();
    }

    public List<StockLot> lotsByIds(Collection<Long> ids) {
        return lots.findAllById(ids);
    }

    /** The lots that arrivals of these batch lines made. */
    public List<StockLot> lotsOfBatchItems(Collection<Long> batchItemIds) {
        return lots.findByBatchItemIdIn(batchItemIds);
    }

    public void saveLots(Collection<StockLot> changed) {
        lots.saveAll(changed);
    }

    private static StockLot newLot(byte[] productId, byte[] variantId, StockLot.Kind kind, int qty) {
        StockLot lot = new StockLot();
        lot.setProductId(productId);
        lot.setVariantId(variantId);
        lot.setKind(kind.name());
        lot.setQtyIn(qty);
        lot.setQtyLeft(qty);
        return lot;
    }
}
