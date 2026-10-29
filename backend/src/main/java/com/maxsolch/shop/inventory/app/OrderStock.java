package com.maxsolch.shop.inventory.app;

import com.maxsolch.shop.platform.util.UuidUtil;
import com.maxsolch.shop.inventory.app.LotLedger;
import com.maxsolch.shop.order.domain.Order;
import com.maxsolch.shop.order.domain.OrderItem;
import com.maxsolch.shop.domain.Product;
import com.maxsolch.shop.domain.ProductVariant;
import com.maxsolch.shop.platform.i18n.Messages;
import com.maxsolch.shop.preorder.app.PreorderQueueService;
import com.maxsolch.shop.repository.ProductRepository;
import com.maxsolch.shop.platform.error.BadRequestException;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.List;

/**
 * The shelf side of an order: every move of units between the shelf and an order line goes through here.
 * One move touches three things that must stay in step — the counters ({@code product.stock} and, when the
 * product has variants, the variant stocks with {@code product.stock} as their rollup), the FIFO lots that
 * give the cost of goods ({@link LotLedger}) and the pre-order queue ({@link PreorderQueueService}: units
 * held for people waiting; units that come back or leave wake or shrink the holds). Callers say <i>what</i>
 * happens to a line; the order of those three steps is decided here.
 *
 * <p>Methods run inside the caller's transaction. The «locked» ones expect the product row to be locked
 * already ({@link ProductRepository#findByIdForUpdate}); the others lock it themselves.
 */
@Component
public class OrderStock {

    private final ProductRepository productRepository;
    private final Messages messages;
    private final LotLedger lots;
    private final PreorderQueueService queue;

    public OrderStock(ProductRepository productRepository, Messages messages, LotLedger lots, PreorderQueueService queue) {
        this.productRepository = productRepository;
        this.messages = messages;
        this.lots = lots;
        this.queue = queue;
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
        int held = queue.heldForOthers(product.getId(), variant == null ? null : variant.getId(), userId);
        if (held <= 0) {
            return;
        }
        int stock = variant != null ? variant.getStock() : product.getStock();
        int available = stock - held;
        if (available < qty) {
            String title = variant != null ? product.getTitle() + " (" + variant.getName() + ")" : product.getTitle();
            throw new BadRequestException(messages.current("api.order.outOfStock", title, Math.max(0, available)));
        }
    }

    /**
     * Takes {@code qty} units off the shelf for an order line (product locked); the line records which stock
     * lots they came from. Refused when the shelf holds fewer.
     *
     * <p>When the product has variants, the variant counters are the source of truth and
     * {@code product.stock} is a pure rollup of them. Keeping it that way (rather than decrementing
     * both independently and clamping at zero) is what stops stock from drifting: the old code lost
     * units on an oversell — {@code Math.max(0, ...)} silently swallowed the difference — and then
     * handed the full quantity back on a cancellation, inventing goods that do not exist.
     */
    public void reserve(Product product, ProductVariant variant, int qty, OrderItem item) {
        if (variant != null) {
            if (variant.getStock() < qty) {
                throw new BadRequestException(messages.current("api.order.outOfStock",
                        product.getTitle() + " (" + variant.getName() + ")", Math.max(0, variant.getStock())));
            }
            variant.setStock(variant.getStock() - qty);
            syncRollup(product);
        } else {
            if (product.getStock() < qty) {
                throw new BadRequestException(messages.current("api.order.outOfStock",
                        product.getTitle(), Math.max(0, product.getStock())));
            }
            product.setStock(product.getStock() - qty);
        }
        lots.take(product.getId(), variant == null ? null : variant.getId(), qty, item);
        // Admin paths (a line added to an order, a cancelled return) may take units that were held for
        // the queue: the latest holds then go back to waiting. In checkout only the buyer's own hold can be
        // here, and onOrderPlaced closes it right after.
        queue.onStockTaken(product, variant, variant != null ? variant.getStock() : product.getStock());
    }

    /**
     * Returns qty to the shelf (inverse of {@link #reserve}; product already locked). With the order line
     * the units go back to the lots they came from; {@code item} null = a write-off restocked.
     */
    public void release(Product product, ProductVariant variant, int qty, OrderItem item) {
        if (variant != null) {
            variant.setStock(variant.getStock() + qty);
            syncRollup(product);
        } else {
            product.setStock(product.getStock() + qty);
        }
        if (qty > 0) {
            lots.give(product.getId(), variant == null ? null : variant.getId(), qty, item);
            // Back in circulation: people waiting for it get holds in turn, as after an arrival.
            queue.onStockReturned(product, variant);
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

    // ------------------------------------------------------------------ order lines

    /**
     * The buyer's places in the queues of what they just bought are done (a hold is used up). Call after
     * the order is saved; no-op for a guest.
     */
    public void onOrderPlaced(Long userId, Order saved) {
        if (userId == null) {
            return;
        }
        queue.onOrderPlaced(userId, saved.getId(), saved.getItems().stream()
                .map(i -> new byte[][]{i.getProductId(), i.getVariantId()})
                .toList());
    }

    /**
     * Returns every line of a cancelled order to stock. Product rows are locked in id order — the same order
     * checkout uses — so a cancellation and a checkout touching the same two products cannot deadlock.
     */
    public void restoreAll(Order order) {
        List<OrderItem> items = new ArrayList<>(order.getItems());
        items.sort(Comparator.comparing(i -> UuidUtil.toString(i.getProductId())));
        for (OrderItem item : items) {
            restoreLine(item);
        }
    }

    /**
     * Returns one line to stock — only the units not already put back by an earlier return
     * ({@link OrderItem#getRestockedQty()}), so nothing is restocked twice.
     */
    public void restoreLine(OrderItem item) {
        // Units returned without «на склад» were written off (damaged etc.) — they never go back.
        restockUnits(item, item.getQuantity() - Math.max(item.getReturnedQty(), item.getRestockedQty()));
    }

    /**
     * Puts {@code units} of one order line back on the shelf and records them on the line (partial returns
     * of {@code Returns} too).
     */
    public void restockUnits(OrderItem item, int units) {
        if (units <= 0) {
            return;
        }
        releaseUnits(item, units);
        item.setRestockedQty(Math.min(item.getQuantity(), item.getRestockedQty() + units));
    }

    /**
     * Puts {@code units} of one order line back on the shelf without recording them on the line —
     * for an exchange, where those units leave the order altogether.
     */
    private void releaseUnits(OrderItem item, int units) {
        productRepository.findByIdForUpdate(item.getProductId()).ifPresent(product -> {
            ProductVariant variant = item.getVariantId() == null ? null : variantOf(product, item.getVariantId());
            if (item.getVariantId() != null && variant == null) {
                // The variant was deleted from the catalog after the order was placed: put the
                // units back on the product so they are not lost entirely.
                product.setStock(product.getStock() + units);
            } else {
                release(product, variant, units, item);
            }
            productRepository.save(product);
        });
    }

    /**
     * Inverse of {@link #restockUnits}: a cancelled return takes the units it put on the shelf back
     * into the order. Refused when they were sold meanwhile (not enough stock).
     */
    public void takeBackUnits(OrderItem item, int units) {
        if (units <= 0) {
            return;
        }
        Product product = productRepository.findByIdForUpdate(item.getProductId())
                .orElseThrow(() -> new BadRequestException("товар «" + item.getTitleSnapshot() + "» удалён из каталога"));
        ProductVariant variant = item.getVariantId() == null ? null : variantOf(product, item.getVariantId());
        int onShelf = variant != null ? variant.getStock() : product.getStock();
        if (onShelf < units) {
            throw new BadRequestException("«" + item.getTitleSnapshot() + "» уже продали: на складе " + Math.max(0, onShelf)
                    + " шт., а вернуть в заказ нужно " + units + ". Верните товар на склад (или поправьте остаток) и повторите.");
        }
        if (item.getVariantId() != null && variant == null) {
            product.setStock(product.getStock() - units);
        } else {
            reserve(product, variant, units, item);
        }
        productRepository.save(product);
        item.setRestockedQty(Math.max(0, item.getRestockedQty() - units));
    }

    /**
     * Admin changed a line's quantity by {@code delta} (not 0): takes or gives back the difference, product
     * locked here.
     */
    public void resizeLine(OrderItem item, int delta) {
        Product product = productRepository.findByIdForUpdate(item.getProductId())
                .orElseThrow(() -> new BadRequestException("product not found"));
        ProductVariant variant = item.getVariantId() == null ? null : variantOf(product, item.getVariantId());
        if (delta > 0) {
            reserve(product, variant, delta, item);
        } else {
            release(product, variant, -delta, item);
        }
        productRepository.save(product);
    }

    /**
     * Moves a line's units from the variant it holds to {@code target} (product already locked by the
     * caller; the caller checked the target has enough). The line's own variant fields stay the caller's.
     */
    public void moveLine(Product product, ProductVariant target, OrderItem item) {
        ProductVariant held = variantOf(product, item.getVariantId());
        if (held != null) {
            release(product, held, item.getQuantity(), item);
        }
        reserve(product, target, item.getQuantity(), item);
        productRepository.save(product);
    }

    // ------------------------------------------------------------------ units without a line

    /** Puts units of a product (variant) back on the shelf — a write-off that turned out fine. */
    public void restockProduct(byte[] productId, byte[] variantId, int units) {
        restockProduct(productId, variantId, units, null);
    }

    /**
     * The same for units that belong to an order line ({@code item}, may be null): they go back into the
     * stock lots they were taken from; units no lot accounts for land in the opening lot.
     */
    public void restockProduct(byte[] productId, byte[] variantId, int units, OrderItem item) {
        if (units <= 0) {
            return;
        }
        Product product = productRepository.findByIdForUpdate(productId)
                .orElseThrow(() -> new BadRequestException("товар удалён из каталога — вернуть на склад некуда"));
        ProductVariant variant = variantId == null ? null : variantOf(product, variantId);
        if (variantId != null && variant == null) {
            product.setStock(product.getStock() + units);
        } else {
            release(product, variant, units, item);
        }
        productRepository.save(product);
    }
}
