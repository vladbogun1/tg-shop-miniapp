package com.maxsolch.shop.inventory.app;

import com.maxsolch.shop.domain.Product;
import com.maxsolch.shop.domain.ProductVariant;
import com.maxsolch.shop.inventory.domain.InventoryErrors;
import com.maxsolch.shop.inventory.domain.LotAllocations;
import com.maxsolch.shop.inventory.domain.StockHolds;
import com.maxsolch.shop.platform.i18n.Messages;
import com.maxsolch.shop.repository.ProductRepository;
import org.springframework.stereotype.Component;

import java.util.Arrays;

/**
 * The shelf: units moving between the shelf and whoever sells them. One move touches three things that must stay
 * in step — the counters ({@code product.stock} and, when the product has variants, the variant stocks with
 * {@code product.stock} as their rollup), the FIFO lots that give the cost of goods ({@link LotLedger}) and the
 * promises to people waiting in a queue ({@link StockHolds}). Callers say <i>what</i> happens; the order of those
 * three steps is decided here. Inventory knows nothing about orders: the sale, when there is one, is a
 * {@link LotAllocations} that remembers the lots.
 *
 * <p>Methods run inside the caller's transaction. The product row is locked by the caller
 * ({@link ProductRepository#findByIdForUpdate}) except in {@link #restockProduct}, which locks it itself.
 */
@Component
public class Stock {

    private final ProductRepository products;
    private final Messages messages;
    private final LotLedger lots;
    private final StockHolds holds;

    public Stock(ProductRepository products, Messages messages, LotLedger lots, StockHolds holds) {
        this.products = products;
        this.messages = messages;
        this.lots = lots;
        this.holds = holds;
    }

    /** The variant of a product by id, or null (also when the product has no variants). */
    public static ProductVariant variantOf(Product product, byte[] variantId) {
        if (product.getVariants() == null) {
            return null;
        }
        return product.getVariants().stream()
                .filter(v -> Arrays.equals(v.getId(), variantId))
                .findFirst()
                .orElse(null);
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
            throw InventoryErrors.badRequest(messages.current("api.order.outOfStock", title, Math.max(0, available)));
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
                throw InventoryErrors.badRequest(messages.current("api.order.outOfStock",
                        product.getTitle() + " (" + variant.getName() + ")", Math.max(0, variant.getStock())));
            }
            variant.setStock(variant.getStock() - qty);
            syncRollup(product);
        } else {
            if (product.getStock() < qty) {
                throw InventoryErrors.badRequest(messages.current("api.order.outOfStock",
                        product.getTitle(), Math.max(0, product.getStock())));
            }
            product.setStock(product.getStock() - qty);
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
            variant.setStock(variant.getStock() + qty);
            syncRollup(product);
        } else {
            product.setStock(product.getStock() + qty);
        }
        if (qty > 0) {
            lots.give(product.getId(), variant == null ? null : variant.getId(), qty, sale);
            // Back in circulation: people waiting for it get holds in turn, as after an arrival.
            holds.onStockReturned(product, variant);
        }
    }

    /** product.stock mirrors the sum of variant stocks whenever the product has variants. */
    private static void syncRollup(Product product) {
        if (product.getVariants() == null || product.getVariants().isEmpty()) {
            return;
        }
        int rollup = product.getVariants().stream().mapToInt(ProductVariant::getStock).sum();
        product.setStock(Math.max(0, rollup));
    }

    // ------------------------------------------------------------------ units without a line

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
                .orElseThrow(() -> InventoryErrors.badRequest("товар удалён из каталога — вернуть на склад некуда"));
        ProductVariant variant = variantId == null ? null : variantOf(product, variantId);
        if (variantId != null && variant == null) {
            product.setStock(product.getStock() + units);
        } else {
            release(product, variant, units, sale);
        }
        products.save(product);
    }
}
