package com.maxsolch.shop.inventory.app;

import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.inventory.domain.InventoryError;
import com.maxsolch.shop.inventory.domain.StockWriteoff;
import com.maxsolch.shop.inventory.infra.StockWriteoffRepository;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.util.List;

/**
 * Write-offs: units that left the shelf without a sale. Other modules (returns, the product admin, the order
 * page) record, read and undo them here instead of reaching into the repository. Runs in the caller's transaction.
 */
@Service
public class StockWriteoffs {

    private final StockWriteoffRepository writeoffs;
    private final Clock clock;

    public StockWriteoffs(StockWriteoffRepository writeoffs, Clock clock) {
        this.writeoffs = writeoffs;
        this.clock = clock;
    }

    /** Records units that left the shelf; the caller has already taken them off the counters. */
    public StockWriteoff record(byte[] productId, byte[] variantId, String title, int quantity,
                                StockWriteoff.Reason reason, String note, byte[] orderId, long unitValueMinor,
                                String adminName) {
        StockWriteoff w = new StockWriteoff();
        w.setProductId(productId);
        w.setVariantId(variantId);
        w.setTitle(title);
        w.setQuantity(quantity);
        w.setReason(reason.name());
        w.setNote(note);
        w.setOrderId(orderId);
        w.setUnitValueMinor(unitValueMinor);
        w.setAdminName(adminName);
        return writeoffs.save(w);
    }

    public StockWriteoff require(long id) {
        return writeoffs.findById(id).orElseThrow(() -> new DomainException.NotFound(InventoryError.WRITE_OFF_NOT_FOUND));
    }

    public java.util.Optional<StockWriteoff> find(long id) {
        return writeoffs.findById(id);
    }

    /** Write-offs that came from one order, oldest first. */
    public List<StockWriteoff> ofOrder(byte[] orderId) {
        return writeoffs.findByOrderIdOrderByCreatedAtAsc(orderId);
    }

    /** {@code quantity} units of the write-off count as written off no more (back on the shelf, or the return was cancelled). */
    public void undo(StockWriteoff w, int quantity, String adminName, String note) {
        w.undo(quantity, clock.instant(), adminName, note);
        writeoffs.save(w);
    }
}
