package com.maxsolch.shop.order.app;

import com.maxsolch.shop.catalog.domain.Product;
import com.maxsolch.shop.catalog.domain.ProductVariant;
import com.maxsolch.shop.inventory.app.Stock;
import com.maxsolch.shop.order.domain.Order;
import com.maxsolch.shop.order.domain.OrderErrors;
import com.maxsolch.shop.order.domain.OrderItem;
import com.maxsolch.shop.platform.util.UuidUtil;
import com.maxsolch.shop.preorder.app.PreorderQueueService;
import com.maxsolch.shop.catalog.app.Products;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

/**
 * The shelf side of an order line: what happens to the units of a line when it is cancelled, returned, resized or
 * moved to another variant. The arithmetic of the shelf itself (counters, FIFO lots, holds for the queue) is
 * {@link Stock}; this class decides <i>which</i> units of the line go where and records it on the line.
 * Methods run inside the caller's transaction and lock the product row themselves unless noted.
 */
@Component
public class OrderStock {

    private final Products productRepository;
    private final Stock stock;
    private final PreorderQueueService queue;

    public OrderStock(Products productRepository, Stock stock, PreorderQueueService queue) {
        this.productRepository = productRepository;
        this.stock = stock;
        this.queue = queue;
    }

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

    /** Puts {@code units} of one order line back on the shelf without recording them on the line. */
    private void releaseUnits(OrderItem item, int units) {
        productRepository.findByIdForUpdate(item.getProductId()).ifPresent(product -> {
            ProductVariant variant = item.getVariantId() == null ? null : Stock.variantOf(product, item.getVariantId());
            if (item.getVariantId() != null && variant == null) {
                // The variant was deleted from the catalog after the order was placed: put the
                // units back on the product so they are not lost entirely.
                product.setStock(product.getStock() + units);
            } else {
                stock.release(product, variant, units, item);
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
                .orElseThrow(() -> OrderErrors.badRequest("товар «" + item.getTitleSnapshot() + "» удалён из каталога"));
        ProductVariant variant = item.getVariantId() == null ? null : Stock.variantOf(product, item.getVariantId());
        int onShelf = variant != null ? variant.getStock() : product.getStock();
        if (onShelf < units) {
            throw OrderErrors.badRequest("«" + item.getTitleSnapshot() + "» уже продали: на складе " + Math.max(0, onShelf)
                    + " шт., а вернуть в заказ нужно " + units + ". Верните товар на склад (или поправьте остаток) и повторите.");
        }
        if (item.getVariantId() != null && variant == null) {
            product.setStock(product.getStock() - units);
        } else {
            stock.reserve(product, variant, units, item);
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
                .orElseThrow(() -> OrderErrors.badRequest("product not found"));
        ProductVariant variant = item.getVariantId() == null ? null : Stock.variantOf(product, item.getVariantId());
        if (delta > 0) {
            stock.reserve(product, variant, delta, item);
        } else {
            stock.release(product, variant, -delta, item);
        }
        productRepository.save(product);
    }

    /**
     * Moves a line's units from the variant it holds to {@code target} (product already locked by the
     * caller; the caller checked the target has enough). The line's own variant fields stay the caller's.
     */
    public void moveLine(Product product, ProductVariant target, OrderItem item) {
        ProductVariant held = Stock.variantOf(product, item.getVariantId());
        if (held != null) {
            stock.release(product, held, item.getQuantity(), item);
        }
        stock.reserve(product, target, item.getQuantity(), item);
        productRepository.save(product);
    }
}
