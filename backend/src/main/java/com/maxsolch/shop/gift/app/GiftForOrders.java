package com.maxsolch.shop.gift.app;

import com.maxsolch.shop.gift.domain.GiftError;
import com.maxsolch.shop.gift.domain.GiftCaseTier;
import com.maxsolch.shop.gift.domain.OrderGiftCase;
import com.maxsolch.shop.order.app.OrderGifts;
import com.maxsolch.shop.order.domain.Order;
import com.maxsolch.shop.platform.error.DomainException;
import org.springframework.stereotype.Component;

import java.security.SecureRandom;
import java.time.Clock;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.function.LongSupplier;

/**
 * The gift as the order sees it ({@link OrderGifts}): draws among the configured prizes and hands the order a
 * plain decision. The order places it and calls the recorder in its own transaction, so nothing here changes
 * when the prize is issued. What can drop is the order's call (its stock, its row locks): it passes a gate.
 */
@Component
public class GiftForOrders implements OrderGifts {

    private static final SecureRandom CASE_RANDOM = new SecureRandom();

    private final GiftService giftService;
    private final GiftRegistryService registry;
    private final Clock clock;

    public GiftForOrders(GiftService giftService, GiftRegistryService registry, Clock clock) {
        this.giftService = giftService;
        this.registry = registry;
        this.clock = clock;
    }

    @Override
    public Optional<ThresholdPlan> thresholdPlan() {
        return giftService.giftConfig().map(this::thresholdPlan);
    }

    private ThresholdPlan thresholdPlan(GiftService.GiftConfig g) {
        return new ThresholdPlan() {
            @Override
            public List<String> productIds() {
                return g.productIds();
            }

            @Override
            public Decision decide(long total, String choice, Gate gate, LongSupplier limitLeft, boolean lowMargin) {
                List<GiftService.TierConfig> reached = g.reached(total);
                if (!reached.isEmpty() && CHOICE_DISCOUNT.equalsIgnoreCase(String.valueOf(choice))) {
                    GiftService.TierConfig top = reached.get(0);
                    long d = top.guaranteedDiscountMinor(total);
                    if (d > 0) {
                        return new Decision.Discount(top.tier().name(), d);
                    }
                }
                long left = limitLeft.getAsLong();
                for (GiftService.TierConfig tier : reached) {
                    // An order with a low-margin product: product prizes drop rarer, discounts on the next order more often.
                    Optional<GiftService.CaseEntry> prize = draw(tier, gate, left, lowMargin);
                    if (prize.isPresent()) {
                        return prize(tier, prize.get(), lowMargin);
                    }
                }
                if (g.productId() != null && total >= g.thresholdMinor() && gate.allows(g.productId(), left)) {
                    return new Decision.ProductGift(g.productId());
                }
                return new Decision.None();
            }
        };
    }

    @Override
    public CasePlan casePlan(String tierName) {
        GiftCaseTier.Tier tier = parse(tierName);
        GiftService.TierConfig cfg = giftService.tier(tier).orElseThrow(() -> new DomainException.BadRequest(GiftError.CASE_HAS_NO_PRIZES));
        return new CasePlan() {
            @Override
            public String tier() {
                return tier.name();
            }

            @Override
            public List<String> productIds() {
                return new ArrayList<>(cfg.prizes().stream().map(GiftService.CaseEntry::productId)
                        .filter(java.util.Objects::nonNull).toList());
            }

            @Override
            public Optional<Decision.Prize> draw(Gate gate, long left, boolean lowMargin) {
                return GiftForOrders.this.draw(cfg, gate, left, lowMargin).map(p -> prize(cfg, p, lowMargin));
            }
        };
    }

    private static GiftCaseTier.Tier parse(String tierName) {
        return GiftService.parseTier(tierName).orElse(GiftCaseTier.Tier.SILVER);
    }

    /** A prize of the tier among those that can drop: a product the gate lets through (giftable, within the limit) or a discount. */
    private static Optional<GiftService.CaseEntry> draw(GiftService.TierConfig tier, Gate gate, long left,
                                                        boolean lowMargin) {
        return GiftService.draw(tier.prizes(), id -> id != null && gate.allows(id, left), CASE_RANDOM,
                tier.productPercent(lowMargin));
    }

    private Decision.Prize prize(GiftService.TierConfig tier, GiftService.CaseEntry entry, boolean lowMargin) {
        return new Decision.Prize(tier.tier().name(), entry.productId(), entry.rarity(), (orderId, title) -> {
            OrderGiftCase rec = GiftService.record(orderId, entry, title);
            rec.setLowMargin(lowMargin && tier.lowMarginProductPercent() < 100);
            giftService.saveOrderCase(rec);
        });
    }

    @Override
    public long limitLeft(Order order) {
        return registry.remainingMinor(GiftRegistryService.personOf(order), clock.instant());
    }

    @Override
    public void deleteCase(byte[] orderId) {
        giftService.deleteOrderCase(orderId);
    }

    @Override
    public void revokeCasePromo(byte[] orderId) {
        giftService.revokeCasePromo(orderId);
    }
}
