package com.maxsolch.shop.order.app;

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
import org.springframework.context.ApplicationEventPublisher;
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
    private final ApplicationEventPublisher events;
    private final OrderGifts gifts;
    private final OrderPromos promos;

    OrderEditing(OrderOps ops, OrderRepository orderRepository, Products productRepository, OrderStock stock, Stock shelf,
                 ApplicationEventPublisher events, OrderGifts gifts, OrderPromos promos) {
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
        OrderItem item = existing != null ? existing : new OrderItem();
        shelf.reserve(product, variant, qty, item);
        if (existing != null) {
            existing.setQuantity(existing.getQuantity() + qty);
        } else {
            item.setOrder(order);
            item.setProductId(product.getId());
            item.setTitleSnapshot(product.getTitle());
            item.setPriceMinorSnapshot(gift ? 0 : product.getPriceMinor());
            item.setQuantity(qty);
            item.setGift(gift);
            item.setGiftValueMinor(gift ? product.getPriceMinor() : 0);
            if (variant != null) {
                item.setVariantId(variant.getId());
                item.setVariantNameSnapshot(variant.getName());
            }
            order.getItems().add(item);
        }
        productRepository.save(product);
        ops.recomputeTotals(order);
        Order saved = orderRepository.save(order);
        events.publishEvent(new OrderEvents.Edited(
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
        order.getItems().remove(item);
        if (item.isAutoGift() && item.getCaseRarity() != null) {
            // The case prize is gone: no case left to open.
            order.setGiftCaseStatus(null);
            order.setGiftCaseOpenedAt(null);
            if (order.getGiftDiscountMinor() <= 0) {
                order.setGiftTier(null);
            }
            gifts.deleteCase(order.getId());
        }
        ops.recomputeTotals(order);
        Order saved = orderRepository.save(order);
        events.publishEvent(OrderEvents.Edited.silent(saved.getId()));
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
        item.setQuantity(newQty);
        ops.recomputeTotals(order);
        Order saved = orderRepository.save(order);
        events.publishEvent(OrderEvents.Edited.of(
                saved.getId(), OrderEvents.EditKind.COMPOSITION, notifyCustomer));
        return saved;
    }

    /** Admin applies / updates / removes a discount: an existing promo code, or a manual amount/percent. */
    @Transactional
    public Order applyDiscount(byte[] orderId, String promoCode, Long amountMinor,
                               Integer percent, boolean clear, boolean notifyCustomer) {
        Order order = ops.lock(orderId);
        order.requireEditable();
        long subtotal = order.getItems().stream()
                .mapToLong(i -> i.getPriceMinorSnapshot() * (long) i.getQuantity()).sum();

        // Release any previous REAL promo usage before re-applying.
        promos.release(order.getPromoCode());

        long discount = 0;
        if (clear) {
            order.setPromoCode(null);
        } else if (promoCode != null && !promoCode.isBlank()) {
            // An admin applying a code by hand is a deliberate decision, so customers' half-hour
            // holds do not stand in their way, only the code own usage limit does.
            // The order customer is passed for the owner check of personal codes (V44).
            PromoCode p = promos.resolve(promoCode, order.getUserId(), false);
            discount = PromoDiscount.discountFor(p, subtotal, promos.excluded(p, promos.lowMarginMinor(order), subtotal));
            promos.countUse(p);
            order.setPromoCode(p.getCode());
        } else if (amountMinor != null && amountMinor > 0) {
            discount = Math.min(amountMinor, subtotal);
            order.setPromoCode("Ручная скидка");
        } else if (percent != null && percent > 0) {
            int pc = Math.min(percent, 100);
            discount = subtotal * pc / 100;
            order.setPromoCode("Ручная скидка " + pc + "%");
        } else {
            order.setPromoCode(null);
        }

        order.setSubtotalMinor(subtotal);
        // The guaranteed discount of the gift case stays: the customer chose it instead of a case.
        order.setDiscountMinor(Math.min(Math.max(0, discount) + Math.max(0, order.getGiftDiscountMinor()), subtotal));
        order.setGiftDiscountMinor(Math.min(order.getGiftDiscountMinor(), order.getDiscountMinor()));
        order.setTotalMinor(OrderMoney.totalMinor(subtotal, order.getDiscountMinor()));
        order.settleIfFree(ops.now());
        Order saved = orderRepository.save(order);
        events.publishEvent(OrderEvents.Edited.of(
                saved.getId(), OrderEvents.EditKind.DISCOUNT, notifyCustomer));
        return saved;
    }
}
