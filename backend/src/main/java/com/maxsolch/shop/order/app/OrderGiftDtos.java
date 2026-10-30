package com.maxsolch.shop.order.app;

import io.swagger.v3.oas.annotations.media.Schema;
import org.springframework.lang.Nullable;

import java.time.Instant;
import java.util.List;

/** The gift block of an order page and the prize parts it is made of (docs/GIFT-CASE.md); the gift module fills them. */
public final class OrderGiftDtos {

    private OrderGiftDtos() {
    }

    /**
     * A prize of a case as the customer sees it.
     *
     * @param key                 stable key («p&lt;productId&gt;» / «d&lt;id&gt;»)
     * @param kind                PRODUCT | DISCOUNT
     * @param discountPercent     DISCOUNT: % off the next order (0 = see {@code discountAmountMinor})
     * @param discountAmountMinor DISCOUNT: fixed amount off the next order
     */
    public record CaseItemDto(String key, @Schema(allowableValues = {"PRODUCT", "DISCOUNT"}) String kind, @Nullable String productId, @Nullable String title, @Nullable String imageUrl,
                              long priceMinor, @Schema(implementation = com.maxsolch.shop.gift.domain.GiftCaseItem.Rarity.class) String rarity, int discountPercent, long discountAmountMinor) {
    }

    /**
     * The size of a product prize with sizes (null for one without).
     *
     * @param pending    the customer has not chosen yet — {@code variantId} is only the one held for them
     * @param changeable may be (re)chosen now (the order is still being put together)
     * @param options    sizes to choose from: in stock or held now
     */
    public record SizeDto(boolean pending, boolean changeable, String variantId, String name,
                          List<SizeOption> options) {
    }

    public record SizeOption(String variantId, String name) {
    }

    /** A personal code the case gave: {@code percent} or {@code amountMinor} off the next order. */
    public record PromoDto(String code, int percent, long amountMinor, @Nullable Instant expiresAt, boolean used) {
    }

    /**
     * Swap of a product prize similar to what the customer bought.
     *
     * @param available   may be swapped now
     * @param amountMinor what the swap gives (a fixed-amount code)
     * @param swappedAt   done (the prize left the order)
     */
    public record SwapDto(boolean available, long amountMinor, @Nullable Instant swappedAt) {
    }

    /**
     * The gift of an order for its page: the tier, the guaranteed discount taken instead of a case,
     * or the case (prize details only after opening).
     */
    /** @param lowMargin admin only (null for the customer): the case was drawn leaning to discounts */
    public record OrderGiftDto(@Schema(implementation = com.maxsolch.shop.gift.domain.GiftCaseTier.Tier.class) @Nullable String tier, long guaranteedDiscountMinor, @Schema(allowableValues = {"SEALED", "OPENED"}) @Nullable String caseStatus, boolean openable,
                               @Nullable CaseItemDto prize, @Nullable PromoDto promo, @Nullable SwapDto swap, @Nullable SizeDto size, @Nullable Boolean lowMargin) {
    }
}
