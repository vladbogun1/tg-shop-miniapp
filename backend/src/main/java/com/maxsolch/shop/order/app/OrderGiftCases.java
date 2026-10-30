package com.maxsolch.shop.order.app;

import com.maxsolch.shop.order.domain.OrderEvents;

import com.maxsolch.shop.catalog.domain.Product;
import com.maxsolch.shop.catalog.domain.ProductVariant;
import com.maxsolch.shop.order.domain.GiftCaseRules;
import com.maxsolch.shop.order.domain.Order;
import com.maxsolch.shop.order.domain.OrderErrors;
import com.maxsolch.shop.order.domain.OrderItem;
import com.maxsolch.shop.order.infra.OrderRepository;
import com.maxsolch.shop.platform.i18n.Messages;
import com.maxsolch.shop.platform.util.UuidUtil;
import com.maxsolch.shop.catalog.app.Products;
import com.maxsolch.shop.platform.tx.DomainEvents;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Consumer;
import java.util.Optional;
import java.util.TreeSet;

/**
 * The gift case of an order after checkout: the customer opens it (once, when the order is paid), swaps a
 * product prize for a code or picks its size, and an admin may give a case to any open order. The rules of
 * what can be opened or swapped are {@link GiftCaseRules}; the prize drawing is {@link OrderGiftPrizes}.
 */
@Service
public class OrderGiftCases {

    private final OrderOps ops;
    private final OrderRepository orderRepository;
    private final Products productRepository;
    private final OrderStock stock;
    private final DomainEvents events;
    private final Messages messages;
    private final OrderGifts gifts;
    private final OrderPromos promos;
    private final OrderGiftPrizes prizes;

    OrderGiftCases(OrderOps ops, OrderRepository orderRepository, Products productRepository, OrderStock stock,
                   DomainEvents events, Messages messages, OrderGifts gifts, OrderPromos promos,
                   OrderGiftPrizes prizes) {
        this.ops = ops;
        this.orderRepository = orderRepository;
        this.productRepository = productRepository;
        this.stock = stock;
        this.events = events;
        this.messages = messages;
        this.gifts = gifts;
        this.promos = promos;
        this.prizes = prizes;
    }

    /**
     * Customer opens the gift case of their order: SEALED to OPENED, exactly once. Only a paid order
     * (the online part arrived), otherwise a customer could order, peek and cancel. The prize was
     * drawn by the server before (checkout / admin), opening only reveals it.
     */
    @Transactional
    public Order openGiftCase(byte[] orderId) {
        Order order = ops.lock(orderId);
        if (order.getGiftCaseStatus() == null) {
            throw OrderErrors.badRequest(messages.current("api.giftCase.none"), GiftCaseRules.GIFT_CASE_NONE);
        }
        if (GiftCaseRules.GIFT_CASE_OPENED.equals(order.getGiftCaseStatus())) {
            throw OrderErrors.badRequest(messages.current("api.giftCase.alreadyOpened"),
                    GiftCaseRules.GIFT_CASE_ALREADY_OPENED);
        }
        if (!GiftCaseRules.giftCaseOpenable(order)) {
            throw OrderErrors.badRequest(messages.current("api.giftCase.unpaid"), GiftCaseRules.GIFT_CASE_UNPAID);
        }
        order.setGiftCaseStatus(GiftCaseRules.GIFT_CASE_OPENED);
        order.setGiftCaseOpenedAt(ops.now());
        return orderRepository.save(order);
    }

    /**
     * The customer swaps the opened case product prize for a code (GiftCaseService decides whether
     * it is similar and what it is worth): the line leaves the order and its unit goes back to stock.
     */
    @Transactional
    public Order removeCasePrizeForSwap(byte[] orderId) {
        Order order = ops.lock(orderId);
        if (!GiftCaseRules.giftCaseSwappable(order)) {
            throw OrderErrors.badRequest(messages.current("api.giftCase.swapUnavailable"),
                    GiftCaseRules.GIFT_CASE_SWAP_UNAVAILABLE);
        }
        OrderItem item = GiftCaseRules.casePrizeLine(order).orElseThrow();
        stock.restoreLine(item);
        order.getItems().remove(item);
        ops.recomputeTotals(order);
        Order saved = orderRepository.save(order);
        events.publish(OrderEvents.Edited.silent(saved.getId()));
        return saved;
    }

    /** A size the customer may pick for the case prize: in stock, or the one held for them now. */
    public record PrizeSize(String variantId, String name, boolean current) {
    }

    /**
     * Sizes of the case prize line to choose from (empty when the prize has none): the one held now and
     * every other one in stock, in the product order.
     */
    @Transactional(readOnly = true)
    public List<PrizeSize> casePrizeSizes(Order order) {
        OrderItem line = GiftCaseRules.casePrizeLine(order).orElse(null);
        if (line == null || line.getVariantId() == null) {
            return List.of();
        }
        Product product = productRepository.findById(line.getProductId()).orElse(null);
        if (product == null || product.getVariants() == null) {
            return List.of();
        }
        return product.getVariants().stream()
                .sorted(Comparator.comparingInt(ProductVariant::getSortOrder))
                .filter(v -> v.getStock() > 0 || Arrays.equals(v.getId(), line.getVariantId()))
                .map(v -> new PrizeSize(UuidUtil.toString(v.getId()), v.getName(),
                        Arrays.equals(v.getId(), line.getVariantId())))
                .toList();
    }

    /**
     * The customer picks the size of the opened case product prize while the order is still being put
     * together: the held unit goes back to stock and one of the chosen size is reserved instead. Picking
     * the held size just confirms it. 400 GiftCaseRules.GIFT_CASE_SIZE_UNAVAILABLE when that size is gone.
     */
    @Transactional
    public Order chooseCasePrizeSize(byte[] orderId, String variantId) {
        Order order = ops.lock(orderId);
        if (!GiftCaseRules.giftCaseSwappable(order)) {
            throw sizeUnavailable();
        }
        OrderItem item = GiftCaseRules.casePrizeLine(order).orElseThrow();
        Product product = productRepository.findByIdForUpdate(item.getProductId()).orElse(null);
        ProductVariant target = product == null || variantId == null ? null : ops.findVariant(product, variantId);
        if (target == null || item.getVariantId() == null) {
            throw sizeUnavailable();
        }
        if (!Arrays.equals(target.getId(), item.getVariantId())) {
            if (target.getStock() < item.getQuantity()) {
                throw sizeUnavailable();
            }
            stock.moveLine(product, target, item);
            item.setVariantId(target.getId());
            item.setVariantNameSnapshot(target.getName());
        }
        item.setVariantPending(false);
        Order saved = orderRepository.save(order);
        events.publish(OrderEvents.Edited.silent(saved.getId()));
        return saved;
    }

    /** The order locked for an update (the gift case reads and changes it in one transaction). */
    @Transactional
    public Order lockForGiftCase(byte[] orderId) {
        return ops.lock(orderId);
    }

    /**
     * Admin gives a gift case of a tier to an order (any sum): the prize is drawn now among the tier
     * prizes (products in stock, discounts) and sealed into the order; the customer opens it once the
     * order is paid.
     */
    @Transactional
    public Order grantGiftCase(byte[] orderId, String tierName, boolean notifyCustomer) {
        Order order = ops.lock(orderId);
        order.requireEditable();
        if (order.getGiftCaseStatus() != null) {
            throw OrderErrors.badRequest("У заказа уже есть кейс");
        }
        OrderGifts.CasePlan plan = gifts.casePlan(tierName);
        // Prize rows locked in id order, like the checkout.
        Map<String, Optional<Product>> locked = new HashMap<>();
        for (String id : new TreeSet<>(plan.productIds())) {
            locked.put(id, productRepository.findByIdForUpdate(ops.toBytes(id, "productId")));
        }
        boolean lowMargin = promos.hasLowMargin(order);
        OrderGifts.Decision.Prize prize = plan.draw(prizes.gate(locked), gifts.limitLeft(order), lowMargin)
                .orElseThrow(() -> OrderErrors.badRequest(
                        "Ни одного приза этого кейса нет в наличии или в пределах месячного лимита подарков покупателя"));
        List<Product> toSave = new ArrayList<>();
        Consumer<byte[]> record = prizes.placeCasePrize(order, prize, locked, toSave);
        if (record == null) {
            throw OrderErrors.badRequest("Приз закончился — попробуйте ещё раз");
        }
        productRepository.saveAll(toSave);
        ops.recomputeTotals(order);
        Order saved = orderRepository.save(order);
        record.accept(saved.getId());
        events.publish(new OrderEvents.Edited(saved.getId(), OrderEvents.EditKind.GIFT_CASE, notifyCustomer,
                null, null, 1));
        return saved;
    }

    private RuntimeException sizeUnavailable() {
        return OrderErrors.badRequest(messages.current("api.giftCase.sizeUnavailable"),
                GiftCaseRules.GIFT_CASE_SIZE_UNAVAILABLE);
    }
}
