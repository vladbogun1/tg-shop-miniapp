package com.maxsolch.shop.order.app;

import com.maxsolch.shop.inventory.app.Stock;
import com.maxsolch.shop.catalog.domain.Product;
import com.maxsolch.shop.catalog.domain.ProductVariant;
import com.maxsolch.shop.order.app.OrderGifts.Decision;
import com.maxsolch.shop.order.domain.GiftCaseRules;
import com.maxsolch.shop.order.domain.Order;
import com.maxsolch.shop.order.domain.OrderItem;
import com.maxsolch.shop.order.domain.OrderMoney;
import org.springframework.stereotype.Component;

import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.Consumer;

/**
 * Placing the gift of an order (docs/GIFT-CASE.md): the gift module draws ({@link OrderGifts}), this puts the
 * result into the order — the guaranteed discount of the reached tier, the case prize as a SEALED case with
 * its line, or the single gift product. Used by the checkout and by the admin who gives a case to an existing
 * order. The products it touches are already row-locked by the caller; it tells the gift what can be given.
 */
@Component
class OrderGiftPrizes {

    private final OrderGifts gifts;
    private final Stock stock;

    OrderGiftPrizes(OrderGifts gifts, Stock stock) {
        this.gifts = gifts;
        this.stock = stock;
    }

    /**
     * The gift of a new order: the tiers its total reaches, dearest first. The customer took the guaranteed
     * discount (the tier offers one): it comes off this order and there is no case. Otherwise a prize of the
     * tier is drawn among those that can drop (a cheaper tier when none can). Without a case the single gift
     * product is the fallback.
     *
     * @return writes the prize record once the order is saved and has its id (given it); null = no case
     */
    Consumer<byte[]> applyThresholdGift(Order order, OrderGifts.ThresholdPlan plan, String choice,
                                Map<String, Optional<Product>> locked, List<Product> toSave, boolean lowMargin) {
        Decision d = plan.decide(order.getTotalMinor(), choice, gate(locked), () -> gifts.limitLeft(order), lowMargin);
        switch (d) {
            case Decision.Discount x -> {
                order.grantGiftDiscount(x.tier(), x.amountMinor());
                return null;
            }
            case Decision.Prize p -> {
                return placeCasePrize(order, p, locked, toSave);
            }
            case Decision.ProductGift g -> {
                locked.getOrDefault(g.productId(), Optional.empty())
                        .ifPresent(p -> addGiftLine(order, p, toSave, null));
                return null;
            }
            case Decision.None n -> {
                return null;
            }
        }
    }

    /** What the gift may hand out now: a product that is giftable and no dearer than the limit left (over it, it does not drop). */
    OrderGifts.Gate gate(Map<String, Optional<Product>> locked) {
        return (id, maxPriceMinor) -> locked.getOrDefault(id, Optional.empty())
                .filter(OrderGiftPrizes::giftable).filter(p -> p.getPriceMinor() <= maxPriceMinor).isPresent();
    }

    /**
     * Seals the drawn prize into the order: a product goes in as a line at price 0, a discount waits for the opening.
     *
     * @return writes the prize record once the order is saved and has its id (given it); null when the product could not be placed
     */
    Consumer<byte[]> placeCasePrize(Order order, Decision.Prize prize, Map<String, Optional<Product>> locked,
                            List<Product> toSave) {
        String title = null;
        if (prize.productId() != null) {
            Product p = locked.getOrDefault(prize.productId(), Optional.empty()).orElse(null);
            if (p == null || !addGiftLine(order, p, toSave, prize.rarity())) {
                return null;
            }
            title = p.getTitle();
        }
        order.sealGiftCase(prize.tier());
        String productTitle = title;
        return orderId -> prize.recorder().save(orderId, productTitle);
    }

    /**
     * One unit of the product at price 0, the variant with the most stock. Out of stock or hidden: the order
     * simply goes without it.
     */
    private boolean addGiftLine(Order order, Product product, List<Product> toSave, String caseRarity) {
        if (!giftable(product)) {
            return false;
        }
        ProductVariant variant = null;
        if (product.getVariants() != null && !product.getVariants().isEmpty()) {
            variant = product.getVariants().stream()
                    .filter(v -> v.getStock() > 0)
                    .max(Comparator.comparingInt(ProductVariant::getStock))
                    .orElseThrow();
        }
        OrderItem item = OrderItem.autoGift(order, product.getId(), product.getTitle(), product.getPriceMinor(), caseRarity);
        stock.reserve(product, variant, 1, item);
        if (variant != null) {
            // A case prize with a choice of sizes: the fullest one is held until the customer picks theirs.
            ProductVariant held = variant;
            item.withVariant(variant.getId(), variant.getName()).pendingVariant(caseRarity != null
                    && product.getVariants().stream().anyMatch(v -> v != held && v.getStock() > 0));
        }
        order.addLine(item);
        toSave.add(product);
        return true;
    }

    /** Can be given away now: visible, and a unit (of some variant) in stock. */
    private static boolean giftable(Product product) {
        if (!product.isActive() || product.isArchived()) {
            return false;
        }
        if (product.getVariants() != null && !product.getVariants().isEmpty()) {
            return product.getVariants().stream().anyMatch(v -> v.getStock() > 0);
        }
        return product.getStock() > 0;
    }
}
