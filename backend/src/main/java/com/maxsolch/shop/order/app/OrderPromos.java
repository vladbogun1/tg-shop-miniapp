package com.maxsolch.shop.order.app;

import com.maxsolch.shop.gift.CaseLowMargin;
import com.maxsolch.shop.gift.GiftService;
import com.maxsolch.shop.order.domain.Order;
import com.maxsolch.shop.order.domain.OrderErrors;
import com.maxsolch.shop.platform.i18n.Messages;
import com.maxsolch.shop.platform.util.UuidUtil;
import com.maxsolch.shop.promo.app.PromoService;
import com.maxsolch.shop.promo.domain.PromoCode;
import com.maxsolch.shop.promo.app.PromoUses;
import org.springframework.stereotype.Component;

import java.util.Optional;
import java.util.Set;

/**
 * Promo codes as the order scenarios (checkout, admin discount) use them: resolve a code under a row lock,
 * count and release a use, and know which part of an order no code touches (the low-margin products of the
 * gift case, "Упор на скидки"). The discount arithmetic itself is {@code PromoDiscount} in the domain.
 */
@Component
public class OrderPromos {

    /**
     * Error code for "this promo code cannot be used". The cart validates codes before checkout, so
     * reaching this means the last use was taken in the meantime: the app drops the code and lets
     * the customer place the order at the price it then shows, instead of dead-ending them.
     */
    public static final String PROMO_REJECTED = "PROMO_REJECTED";

    private final OrderOps ops;
    private final PromoUses promoUses;
    private final PromoService promoService;
    private final Messages messages;
    private final CaseLowMargin caseLowMargin;

    OrderPromos(OrderOps ops, PromoUses promoUses, PromoService promoService, Messages messages,
                CaseLowMargin caseLowMargin) {
        this.ops = ops;
        this.promoUses = promoUses;
        this.promoService = promoService;
        this.messages = messages;
        this.caseLowMargin = caseLowMargin;
    }

    /**
     * Resolves an active promo code and takes a row lock on it, so the "usage limit reached" check
     * and the {@code usesCount++} that follows in the caller are atomic with respect to other
     * checkouts. Without the lock a code limited to one use could be redeemed by several
     * simultaneous orders. Null for a blank code.
     */
    PromoCode resolve(String code, Long tgUserId, boolean respectHolds) {
        if (code == null || code.isBlank()) {
            return null;
        }
        Optional<PromoCode> opt = promoUses.lockActive(code.trim());
        if (opt.isEmpty()) {
            // Russian, and tagged: this text is shown to the customer, and the app clears the
            // dead code from the cart instead of leaving them stuck on the last step.
            throw OrderErrors.badRequest(messages.current("api.promo.rejected"), PROMO_REJECTED);
        }
        PromoCode promo = opt.get();
        // Personal codes (review bonus, V44): only the owner, and only until they expire.
        String personal = PromoService.personalRejection(promo, tgUserId, ops.now());
        if (personal != null) {
            throw OrderErrors.badRequest(messages.current(personal), PROMO_REJECTED);
        }
        // Remaining uses minus other customers' live holds: a code someone reserved from their cart
        // must not be taken by a checkout that merely submitted first.
        long left = respectHolds
                ? promoService.remainingUses(promo, tgUserId)
                : (promo.getMaxUses() == null ? Long.MAX_VALUE : promo.getMaxUses() - promo.getUsesCount());
        if (left <= 0) {
            throw OrderErrors.badRequest(messages.current("api.promo.taken"), PROMO_REJECTED);
        }
        return promo;
    }

    /** One more use of a code that {@link #resolve} locked. */
    void countUse(PromoCode promo) {
        promoUses.countUse(promo);
    }

    /**
     * The use is counted on the code now; leaving the customer half-hour hold in place would block one
     * more use for the rest of that half hour.
     */
    void consumeHold(PromoCode promo, long tgUserId) {
        promoService.consume(promo.getId(), tgUserId);
    }

    /** Decrement usesCount of a previously-applied REAL promo code (ignores manual-discount labels). */
    void release(String code) {
        if (code == null || code.isBlank()) {
            return;
        }
        promoUses.release(code);
    }

    /**
     * What of the subtotal a code does not touch: the low-margin products ("Упор на скидки"): no promo
     * code applies to them, a case code or any other. A code on a cart of only such products is refused,
     * so the use is not wasted.
     */
    long excluded(PromoCode promo, long lowMarginMinor, long subtotal) {
        if (promo == null || lowMarginMinor <= 0) {
            return 0;
        }
        if (subtotal - lowMarginMinor <= 0) {
            throw OrderErrors.badRequest(messages.current("api.promo.caseExcluded"), PROMO_REJECTED);
        }
        return lowMarginMinor;
    }

    public static boolean isCasePromo(PromoCode promo) {
        return promo != null && GiftService.PROMO_SOURCE.equals(promo.getSource());
    }

    /** Price x quantity of the order own lines (not gifts) whose product is low-margin. */
    long lowMarginMinor(Order order) {
        Set<String> ids = lowMarginIds();
        return ids.isEmpty() ? 0 : order.getItems().stream()
                .filter(i -> !i.isGift() && ids.contains(UuidUtil.toString(i.getProductId())))
                .mapToLong(i -> i.getPriceMinorSnapshot() * (long) i.getQuantity())
                .sum();
    }

    /** The order has a low-margin product of its own (not a gift): its case leans to discounts. */
    boolean hasLowMargin(Order order) {
        Set<String> ids = lowMarginIds();
        return !ids.isEmpty() && order.getItems().stream()
                .anyMatch(i -> !i.isGift() && ids.contains(UuidUtil.toString(i.getProductId())));
    }

    private Set<String> lowMarginIds() {
        return caseLowMargin.none() ? Set.of() : caseLowMargin.productIds();
    }
}
