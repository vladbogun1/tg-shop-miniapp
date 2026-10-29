package com.maxsolch.shop.order.app;

import com.maxsolch.shop.inventory.app.Stock;
import com.maxsolch.shop.domain.Product;
import com.maxsolch.shop.domain.ProductVariant;
import com.maxsolch.shop.gift.GiftCaseTier;
import com.maxsolch.shop.gift.GiftRegistryService;
import com.maxsolch.shop.gift.GiftService;
import com.maxsolch.shop.gift.OrderGiftCase;
import com.maxsolch.shop.order.domain.GiftCaseRules;
import com.maxsolch.shop.order.domain.Order;
import com.maxsolch.shop.order.domain.OrderItem;
import com.maxsolch.shop.order.domain.OrderMoney;
import org.springframework.stereotype.Component;

import java.security.SecureRandom;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.Predicate;

/**
 * Drawing and placing the gift of an order (docs/GIFT-CASE.md): the guaranteed discount of the reached tier,
 * the case prize drawn among what can drop, or the single gift product. Used by the checkout and by the
 * admin who gives a case to an existing order. The products it touches are already row-locked by the caller.
 */
@Component
class OrderGiftPrizes {

    private static final SecureRandom CASE_RANDOM = new SecureRandom();

    private final OrderOps ops;
    private final GiftRegistryService giftRegistry;
    private final Stock stock;

    OrderGiftPrizes(OrderOps ops, GiftRegistryService giftRegistry, Stock stock) {
        this.ops = ops;
        this.giftRegistry = giftRegistry;
        this.stock = stock;
    }

    /**
     * The gift of a new order: walks the tiers its total reaches, dearest first. The customer took the
     * guaranteed discount ({@code choice} DISCOUNT, the tier offers one): it comes off this order and
     * there is no case. Otherwise a prize of the tier is drawn among those that can drop (a cheaper
     * tier when none can). Without a case the single gift product is the fallback.
     *
     * @return the prize record to save once the order has its id; null = no case
     */
    OrderGiftCase applyThresholdGift(Order order, GiftService.GiftConfig g, String choice,
                                     Map<String, Optional<Product>> locked, List<Product> toSave,
                                     boolean lowMargin) {
        long total = order.getTotalMinor();
        List<GiftService.TierConfig> reached = g.reached(total);
        if (!reached.isEmpty() && GiftService.CHOICE_DISCOUNT.equalsIgnoreCase(String.valueOf(choice))) {
            GiftService.TierConfig top = reached.get(0);
            long d = top.guaranteedDiscountMinor(total);
            if (d > 0) {
                order.setGiftTier(top.tier().name());
                order.setGiftDiscountMinor(d);
                order.setDiscountMinor(Math.min(order.getSubtotalMinor(), order.getDiscountMinor() + d));
                order.setTotalMinor(OrderMoney.totalMinor(order.getSubtotalMinor(), order.getDiscountMinor()));
                return null;
            }
        }
        long left = limitLeft(order);
        for (GiftService.TierConfig tier : reached) {
            // An order with a low-margin product: product prizes drop rarer, discounts on the next order more often.
            Optional<GiftService.CaseEntry> prize = draw(tier, locked, left, lowMargin);
            if (prize.isPresent()) {
                OrderGiftCase rec = placeCasePrize(order, tier.tier(), prize.get(), locked, toSave);
                if (rec != null) {
                    rec.setLowMargin(lowMargin && tier.lowMarginProductPercent() < 100);
                    return rec;
                }
            }
        }
        if (g.productId() != null && total >= g.thresholdMinor()) {
            locked.getOrDefault(g.productId(), Optional.empty())
                    .filter(p -> p.getPriceMinor() <= left)
                    .ifPresent(p -> addGiftLine(order, p, toSave, null));
        }
        return null;
    }

    /**
     * What is left of the monthly gift limit of the order person (docs/GIFT-CASE.md, "Реестр подарков
     * и месячный лимит"), kopecks; {@link Long#MAX_VALUE} without a limit.
     */
    long limitLeft(Order order) {
        return giftRegistry.remainingMinor(GiftRegistryService.Person.of(order), ops.now());
    }

    /**
     * Draws a prize of the tier among the ones that can drop: a product that is giftable and no dearer than
     * {@code left} (over the limit it does not drop), or a discount (always can).
     */
    Optional<GiftService.CaseEntry> draw(GiftService.TierConfig tier, Map<String, Optional<Product>> locked, long left,
                                         boolean lowMargin) {
        Predicate<String> giftableIn = id -> id != null
                && locked.getOrDefault(id, Optional.empty()).filter(OrderGiftPrizes::giftable).isPresent();
        Predicate<String> within = giftableIn.and(id -> locked.get(id).map(p -> p.getPriceMinor() <= left).orElse(false));
        return GiftService.draw(tier.prizes(), within, CASE_RANDOM, tier.productPercent(lowMargin));
    }

    /** Seals the drawn prize into the order: a product goes in as a line at price 0, a discount waits for the opening. */
    OrderGiftCase placeCasePrize(Order order, GiftCaseTier.Tier tier, GiftService.CaseEntry prize,
                                 Map<String, Optional<Product>> locked, List<Product> toSave) {
        String title = null;
        if (!prize.isDiscount()) {
            Product p = locked.getOrDefault(prize.productId(), Optional.empty()).orElse(null);
            if (p == null || !addGiftLine(order, p, toSave, prize.rarity())) {
                return null;
            }
            title = p.getTitle();
        }
        order.setGiftTier(tier.name());
        order.setGiftCaseStatus(GiftCaseRules.GIFT_CASE_SEALED);
        order.setGiftCaseOpenedAt(null);
        return GiftService.record(order.getId(), prize, title);
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
        OrderItem item = new OrderItem();
        stock.reserve(product, variant, 1, item);
        item.setOrder(order);
        item.setProductId(product.getId());
        item.setTitleSnapshot(product.getTitle());
        item.setPriceMinorSnapshot(0);
        item.setQuantity(1);
        item.setGift(true);
        item.setGiftValueMinor(product.getPriceMinor());
        item.setAutoGift(true);
        item.setCaseRarity(caseRarity);
        if (variant != null) {
            item.setVariantId(variant.getId());
            item.setVariantNameSnapshot(variant.getName());
            // A case prize with a choice of sizes: the fullest one is held until the customer picks theirs.
            ProductVariant held = variant;
            item.setVariantPending(caseRarity != null
                    && product.getVariants().stream().anyMatch(v -> v != held && v.getStock() > 0));
        }
        order.getItems().add(item);
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
