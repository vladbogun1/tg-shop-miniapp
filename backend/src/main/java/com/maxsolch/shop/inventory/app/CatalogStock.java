package com.maxsolch.shop.inventory.app;

import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.inventory.domain.InventoryError;
import com.maxsolch.shop.catalog.app.ProductStock;
import com.maxsolch.shop.catalog.domain.Product;
import com.maxsolch.shop.inventory.domain.StockWriteoff;
import com.maxsolch.shop.platform.audit.AdminAuditService;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Locale;

import static com.maxsolch.shop.platform.util.Texts.trimToNull;

/** The stock ledger behind the catalog's {@link ProductStock} port: FIFO lots and write-offs of hand edits. */
@Component
public class CatalogStock implements ProductStock {


    private final LotLedger ledger;
    private final StockWriteoffs writeoffs;
    private final AdminAuditService audit;

    public CatalogStock(LotLedger ledger, StockWriteoffs writeoffs, AdminAuditService audit) {
        this.ledger = ledger;
        this.writeoffs = writeoffs;
        this.audit = audit;
    }

    @Override
    public void syncLots(Product product) {
        ledger.syncProduct(product);
    }

    @Override
    public void recordDrops(Product p, List<StockDrop> drops, String rawReason, String rawNote) {
        if (drops.isEmpty()) {
            return;
        }
        StockWriteoff.Reason reason = parseReason(rawReason);
        String note = trimToNull(rawNote);
        if (reason == null) {
            throw new DomainException.BadRequest(InventoryError.STOCK_REASON_REQUIRED);
        }
        if (reason == StockWriteoff.Reason.OTHER && note == null) {
            throw new DomainException.BadRequest(InventoryError.STOCK_REASON_REQUIRED_OTHER);
        }
        String admin = audit.currentAdminName();
        for (StockDrop d : drops) {
            writeoffs.record(p.getId(), d.variantId(),
                    d.variantName() == null ? p.getTitle() : p.getTitle() + " / " + d.variantName(), d.quantity(),
                    reason, note == null ? null : note.length() > 500 ? note.substring(0, 500) : note,
                    null, p.getPriceMinor(), admin);
        }
    }

    static StockWriteoff.Reason parseReason(String raw) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        try {
            return StockWriteoff.Reason.valueOf(raw.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException e) {
            return null;
        }
    }
}
