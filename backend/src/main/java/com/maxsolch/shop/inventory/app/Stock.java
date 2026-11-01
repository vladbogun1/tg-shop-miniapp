package com.maxsolch.shop.inventory.app;

import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.inventory.domain.InventoryError;
import com.maxsolch.shop.catalog.domain.Product;
import com.maxsolch.shop.catalog.domain.ProductVariant;
import com.maxsolch.shop.inventory.domain.LotAllocations;
import com.maxsolch.shop.inventory.domain.StockHolds;
import com.maxsolch.shop.platform.i18n.Messages;
import com.maxsolch.shop.catalog.app.Products;
import org.springframework.stereotype.Component;

/**
 * The shelf: units moving between the shelf and whoever sells them. One move touches three things that must stay
 * in step — the counters ({@code product.stock} and, when the product has variants, the variant stocks with
 * {@code product.stock} as their rollup), the FIFO lots that give the cost of goods ({@link LotLedger}) and the
 * promises to people waiting in a queue ({@link StockHolds}). Callers say <i>what</i> happens; the order of those
 * three steps is decided here. Inventory knows nothing about orders: the sale, when there is one, is a
 * {@link LotAllocations} that remembers the lots.
 *
 * <p>Methods run inside the caller's transaction. The product row is locked by the caller
 * ({@link Products#findByIdForUpdate}) except in {@link #restockProduct}, which locks it itself.
 */
@Component
public class Stock {

    private final Products products;
    private final Messages messages;
    private final LotLedger lots;
    private final StockHolds holds;

    public Stock(Products products, Messages messages, LotLedger lots, StockHolds holds) {
        this.products = products;
        this.messages = messages;
        this.lots = lots;
        this.holds = holds;
    }

    // ------------------------------------------------------------------ taking units

    /**
     * Units on hold for other people in a pre-order queue are not for sale: the customer sees
     * {@code stock − held for others}. Their own hold counts as available to them.
     */
    public void requireAvailable(Product product, ProductVariant variant, int qty, Long userId) {
        int held = holds.heldForOthers(product.getId(), variant == null ? null : variant.getId(), userId);
        if (held <= 0) {
            return;
        }
        int stock = variant != null ? variant.getStock() : product.getStock();
        int available = stock - held;
        if (available < qty) {
            String title = variant != null ? product.getTitle() + " (" + variant.getName() + ")" : product.getTitle();
            throw new DomainException.BadRequest(InventoryError.OUT_OF_STOCK, title, Math.max(0, available));
        }
    }

    /**
     * Takes {@code qty} units off the shelf (product locked); {@code sale} records which stock lots they came
     * from. Refused when the shelf holds fewer.
     *
     * <p>When the product has variants, the variant counters are the source of truth and
     * {@code product.stock} is a pure rollup of them. Keeping it that way (rather than decrementing
     * both independently and clamping at zero) is what stops stock from drifting: the old code lost
     * units on an oversell — {@code Math.max(0, ...)} silently swallowed the difference — and then
     * handed the full quantity back on a cancellation, inventing goods that do not exist.
     */
    public void reserve(Product product, ProductVariant variant, int qty, LotAllocations sale) {
        if (variant != null) {
            if (variant.getStock() < qty) {
                throw new DomainException.BadRequest(InventoryError.OUT_OF_STOCK, product.getTitle() + " (" + variant.getName() + ")", Math.max(0, variant.getStock()));
            }
            variant.changeStock(variant.getStock() - qty);
            product.syncStockFromVariants();
        } else {
            if (product.getStock() < qty) {
                throw new DomainException.BadRequest(InventoryError.OUT_OF_STOCK, product.getTitle(), Math.max(0, product.getStock()));
            }
            product.changeStock(product.getStock() - qty);
        }
        lots.take(product.getId(), variant == null ? null : variant.getId(), qty, sale);
        // Admin paths (a line added to an order, a cancelled return) may take units that were held for
        // the queue: the latest holds then go back to waiting. In checkout only the buyer's own hold can be
        // here, and the order closes it right after.
        holds.onStockTaken(product, variant, variant != null ? variant.getStock() : product.getStock());
    }

    /**
     * Returns qty to the shelf (inverse of {@link #reserve}; product already locked). With a sale the units go
     * back to the lots they came from; {@code sale} null = a write-off restocked.
     */
    public void release(Product product, ProductVariant variant, int qty, LotAllocations sale) {
        if (variant != null) {
            variant.changeStock(variant.getStock() + qty);
            product.syncStockFromVariants();
        } else {
            product.changeStock(product.getStock() + qty);
        }
        if (qty > 0) {
            lots.give(product.getId(), variant == null ? null : variant.getId(), qty, sale);
            // Back in circulation: people waiting for it get holds in turn, as after an arrival.
            holds.onStockReturned(product, variant);
        }
    }

    /**
     * {@link #release} for a line that knows its variant only by id (product locked). A variant deleted from the
     * catalog after the sale: the units go back on the product so they are not lost — no lots, no queue.
     */
    public void releaseById(Product product, byte[] variantId, int qty, LotAllocations sale) {
        ProductVariant variant = variantId == null ? null : product.variant(variantId);
        if (variantId != null && variant == null) {
            product.changeStock(product.getStock() + qty);
        } else {
            release(product, variant, qty, sale);
        }
    }

    /** {@link #reserve} for a line that knows its variant only by id; a deleted variant is taken from the product. */
    public void reserveById(Product product, byte[] variantId, int qty, LotAllocations sale) {
        ProductVariant variant = variantId == null ? null : product.variant(variantId);
        if (variantId != null && variant == null) {
            product.changeStock(product.getStock() - qty);
        } else {
            reserve(product, variant, qty, sale);
        }
    }

    /**
     * A supplier batch line arrived (product locked): the units go on the shelf and into a new FIFO lot of the
     * batch line. {@code variant} null = a product without variants. The queue is handed out by the caller.
     */
    public void arrive(Product product, ProductVariant variant, int units, long batchItemId) {
        if (variant != null) {
            variant.changeStock(variant.getStock() + units);
            product.syncStockFromVariants();
        } else {
            product.changeStock(product.getStock() + units);
        }
        if (units > 0) {
            lots.receive(product.getId(), variant == null ? null : variant.getId(), batchItemId, units);
        }
    }

    // ------------------------------------------------------------------ units without a line

    /**
     * The admin typed a stock by hand: the counter becomes exactly {@code units} (the lots follow in
     * {@link LotLedger#syncProduct}, a drop is written off by the caller). A variant's own counter, or the
     * product's when {@code variant} is null; with variants the product keeps the rollup.
     */
    public static void overwrite(Product product, ProductVariant variant, int units) {
        if (variant != null) {
            variant.changeStock(units);
            product.syncStockFromVariants();
        } else {
            product.changeStock(units);
        }
    }

    /** Puts units of a product (variant) back on the shelf — a write-off that turned out fine. */
    public void restockProduct(byte[] productId, byte[] variantId, int units) {
        restockProduct(productId, variantId, units, null);
    }

    /**
     * The same for units that belong to a sale ({@code sale}, may be null): they go back into the stock lots
     * they were taken from; units no lot accounts for land in the opening lot. Locks the product row.
     */
    public void restockProduct(byte[] productId, byte[] variantId, int units, LotAllocations sale) {
        if (units <= 0) {
            return;
        }
        Product product = products.findByIdForUpdate(productId)
                .orElseThrow(() -> new DomainException.BadRequest(InventoryError.PRODUCT_DELETED));
        releaseById(product, variantId, units, sale);
        products.save(product);
    }
}
