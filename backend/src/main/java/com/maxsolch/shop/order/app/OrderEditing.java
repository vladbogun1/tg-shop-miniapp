package com.maxsolch.shop.order.app;

import com.maxsolch.shop.order.domain.OrderEvents;

import com.maxsolch.shop.inventory.app.Stock;
import com.maxsolch.shop.catalog.domain.Product;
import com.maxsolch.shop.catalog.domain.ProductVariant;
import com.maxsolch.shop.order.domain.Order;
import com.maxsolch.shop.order.domain.OrderErrors;
import com.maxsolch.shop.order.domain.OrderItem;
import com.maxsolch.shop.order.domain.OrderMoney;
import com.maxsolch.shop.promo.domain.PromoDiscount;
import com.maxsolch.shop.order.infra.OrderRepository;
import com.maxsolch.shop.promo.domain.PromoCode;
import com.maxsolch.shop.catalog.app.Products;
import com.maxsolch.shop.platform.tx.DomainEvents;
import com.maxsolch.shop.platform.util.Money;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Arrays;

/**
 * What an admin changes in an order that has not shipped: add a gift or a line, remove a line, change a
 * quantity, apply or clear a discount. Each change reserves or returns the stock, recomputes the totals and
 * tells the customer when the admin asked to.
 */
@Service
public class OrderEditing {

    private final OrderOps ops;
    private final OrderRepository orderRepository;
    private final Products productRepository;
    private final OrderStock stock;
    private final Stock shelf;
    private final DomainEvents events;
    private final OrderGifts gifts;
    private final OrderPromos promos;

    OrderEditing(OrderOps ops, OrderRepository orderRepository, Products productRepository, OrderStock stock, Stock shelf,
                 DomainEvents events, OrderGifts gifts, OrderPromos promos) {
        this.ops = ops;
        this.orderRepository = orderRepository;
        this.productRepository = productRepository;
        this.stock = stock;
        this.shelf = shelf;
        this.events = events;
        this.gifts = gifts;
        this.promos = promos;
    }

    /** Admin adds a FREE gift product to an order: stock is decremented (unit is reserved),
     *  the item is added at price 0 (so total/COD do not change), gifts merge by product+variant. */
    @Transactional
    public Order addItem(byte[] orderId, String productId, String variantId, int qty,
                         boolean gift, boolean notifyCustomer) {
        Order order = ops.lock(orderId);
        order.requireEditable();
        if (qty < 1) {
            throw OrderErrors.badRequest("quantity must be >= 1");
        }
        // Locked: this path mutates stock too (an admin adding a gift reserves real units).
        Product product = productRepository.findByIdForUpdate(ops.toBytes(productId, "productId"))
                .orElseThrow(() -> OrderErrors.badRequest("unknown product: " + productId));
        if (product.isArchived()) {
            throw OrderErrors.badRequest("product is archived: " + product.getTitle());
        }
        boolean hasVariants = product.getVariants() != null && !product.getVariants().isEmpty();
        ProductVariant variant = null;
        if (hasVariants) {
            if (variantId == null || variantId.isBlank()) {
                throw OrderErrors.badRequest("variant is required for product: " + product.getTitle());
            }
            variant = ops.findVariant(product, variantId);
            if (variant == null) {
                throw OrderErrors.badRequest("variant does not belong to product: " + variantId);
            }
        }
        byte[] vId = variant == null ? null : variant.getId();
        OrderItem existing = order.getItems().stream()
                .filter(i -> i.isGift() == gift)
                .filter(i -> Arrays.equals(i.getProductId(), product.getId()))
                .filter(i -> Arrays.equals(i.getVariantId(), vId))
                .findFirst().orElse(null);
        OrderItem item = existing != null ? existing
                : gift ? OrderItem.gift(order, product.getId(), product.getTitle(), product.getPriceMinor(), qty)
                : OrderItem.sold(order, product.getId(), product.getTitle(), product.getPriceMinor(), qty);
        shelf.reserve(product, variant, qty, item);
        if (existing != null) {
            existing.addQuantity(qty);
        } else {
            if (variant != null) {
                item.withVariant(variant.getId(), variant.getName());
            }
            order.addLine(item);
        }
        productRepository.save(product);
        ops.recomputeTotals(order);
        Order saved = orderRepository.save(order);
        events.publish(new OrderEvents.Edited(
                saved.getId(),
                gift ? OrderEvents.EditKind.GIFT : OrderEvents.EditKind.COMPOSITION,
                notifyCustomer,
                product.getTitle(),
                variant == null ? null : variant.getName(),
                qty));
        return saved;
    }

    /** Admin removes an order item (a gift or a line), restoring its stock and recomputing totals. */
    @Transactional
    public Order removeItem(byte[] orderId, long itemId) {
        Order order = ops.lock(orderId);
        order.requireEditable();
        OrderItem item = order.getItems().stream()
                .filter(i -> i.getId() != null && i.getId() == itemId)
                .findFirst()
                .orElseThrow(() -> OrderErrors.notFound("order item not found"));
        stock.restoreLine(item);
        order.removeLine(item);
        if (item.isAutoGift() && item.getCaseRarity() != null) {
            // The case prize is gone: no case left to open.
            order.dropGiftCase();
            gifts.deleteCase(order.getId());
        }
        ops.recomputeTotals(order);
        Order saved = orderRepository.save(order);
        events.publish(OrderEvents.Edited.silent(saved.getId()));
        return saved;
    }

    /** Admin changes an item quantity, reserving/releasing stock by the delta. */
    @Transactional
    public Order changeItemQuantity(byte[] orderId, long itemId, int newQty, boolean notifyCustomer) {
        Order order = ops.lock(orderId);
        order.requireEditable();
        if (newQty < 1) {
            throw OrderErrors.badRequest("quantity must be >= 1 (use remove to delete)");
        }
        OrderItem item = order.getItems().stream()
                .filter(i -> i.getId() != null && i.getId() == itemId)
                .findFirst()
                .orElseThrow(() -> OrderErrors.notFound("order item not found"));
        int delta = newQty - item.getQuantity();
        if (delta != 0) {
            stock.resizeLine(item, delta);
        }
        item.changeQuantity(newQty);
        ops.recomputeTotals(order);
        Order saved = orderRepository.save(order);
        events.publish(OrderEvents.Edited.of(
                saved.getId(), OrderEvents.EditKind.COMPOSITION, notifyCustomer));
        return saved;
    }

    /** Admin applies / updates / removes a discount: an existing promo code, or a manual amount/percent. */
    @Transactional
    public Order applyDiscount(byte[] orderId, String promoCode, Long amountMinor,
                               Integer percent, boolean clear, boolean notifyCustomer) {
        Order order = ops.lock(orderId);
        order.requireEditable();
        long subtotal = OrderMoney.subtotalMinor(order);

        // Release any previous REAL promo usage before re-applying.
        promos.release(order.getPromoCode());

        long discount = 0;
        if (clear) {
            order.labelPromo(null);
        } else if (promoCode != null && !promoCode.isBlank()) {
            // An admin applying a code by hand is a deliberate decision, so customers' half-hour
            // holds do not stand in their way, only the code own usage limit does.
            // The order customer is passed for the owner check of personal codes (V44).
            PromoCode p = promos.resolve(promoCode, order.getUserId(), false);
            discount = PromoDiscount.discountFor(p, subtotal, promos.excluded(p, promos.lowMarginMinor(order), subtotal));
            promos.countUse(p);
            order.labelPromo(p.getCode());
        } else if (amountMinor != null && amountMinor > 0) {
            discount = Math.min(amountMinor, subtotal);
            order.labelPromo("Ручная скидка");
        } else if (percent != null && percent > 0) {
            int pc = Math.min(percent, 100);
            discount = Money.percentOf(subtotal, pc);
            order.labelPromo("Ручная скидка " + pc + "%");
        } else {
            order.labelPromo(null);
        }

        // The guaranteed discount of the gift case stays: the customer chose it instead of a case.
        order.applyDiscount(discount);
        order.settleIfFree(ops.now());
        Order saved = orderRepository.save(order);
        events.publish(OrderEvents.Edited.of(
                saved.getId(), OrderEvents.EditKind.DISCOUNT, notifyCustomer));
        return saved;
    }
}
