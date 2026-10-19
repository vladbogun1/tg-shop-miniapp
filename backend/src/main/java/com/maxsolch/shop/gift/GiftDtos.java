package com.maxsolch.shop.gift;

import com.maxsolch.shop.web.dto.ProductDto;

import java.time.Instant;
import java.util.List;

/** API of the gift for the order sum and the gift cases (docs/GIFT-CASE.md). */
public final class GiftDtos {

    private GiftDtos() {
    }

    /**
     * The gift for the order sum as the storefront shows it (GET /api/public/gift). The clients count
     * «add N more» themselves: the next tier's {@code thresholdMinor} − the cart total after the
     * discount (or − the product price on the product page); the checkout decides it again on the server.
     *
     * @param thresholdMinor the cheapest way to get anything (the bronze tier, or the single product)
     * @param kind           PRODUCT (one known gift) | CASE (a random prize of the reached tier)
     * @param product        the gift (kind PRODUCT); null for a case
     * @param tiers          case tiers with prizes, cheapest first (kind CASE)
     */
    public record GiftInfoDto(long thresholdMinor, String kind, ProductDto product, List<TierInfoDto> tiers) {
    }

    /**
     * A case tier for the storefront.
     *
     * @param guaranteedPercent  the «guaranteed discount instead of the case» choice, %; 0 = no choice
     * @param guaranteedMaxMinor its cap; 0 = no cap
     * @param swap               a similar prize may be swapped for a discount
     * @param prizes             what can drop, most common first — without chances (never shown)
     */
    public record TierInfoDto(String tier, long thresholdMinor, int guaranteedPercent, long guaranteedMaxMinor,
                              boolean swap, List<CaseItemDto> prizes) {
    }

    /** GET /api/public/gift; {@code gift} null = the gift is off or has nothing to give. */
    public record GiftResponse(GiftInfoDto gift) {
    }

    /**
     * A prize of a case as the customer sees it.
     *
     * @param key                 stable key («p&lt;productId&gt;» / «d&lt;id&gt;»)
     * @param kind                PRODUCT | DISCOUNT
     * @param discountPercent     DISCOUNT: % off the next order (0 = see {@code discountAmountMinor})
     * @param discountAmountMinor DISCOUNT: fixed amount off the next order
     */
    public record CaseItemDto(String key, String kind, String productId, String title, String imageUrl,
                              long priceMinor, String rarity, int discountPercent, long discountAmountMinor) {
    }

    /**
     * Opening the case of an order (or reading it again once opened): the prize drawn at checkout,
     * the tier's prizes for the reel, the issued code (a discount prize) and the swap offer.
     */
    public record CaseOpenDto(String status, String tier, CaseItemDto won, List<CaseItemDto> reel,
                              PromoDto promo, SwapDto swap) {
    }

    /** A personal code the case gave: {@code percent} or {@code amountMinor} off the next order. */
    public record PromoDto(String code, int percent, long amountMinor, Instant expiresAt, boolean used) {
    }

    /**
     * Swap of a product prize similar to what the customer bought.
     *
     * @param available   may be swapped now
     * @param amountMinor what the swap gives (a fixed-amount code)
     * @param swappedAt   done (the prize left the order)
     */
    public record SwapDto(boolean available, long amountMinor, Instant swappedAt) {
    }

    /**
     * The gift of an order for its page: the tier, the guaranteed discount taken instead of a case,
     * or the case (prize details only after opening).
     */
    public record OrderGiftDto(String tier, long guaranteedDiscountMinor, String caseStatus, boolean openable,
                               CaseItemDto prize, PromoDto promo, SwapDto swap) {
    }

    // ---- admin ----

    public record TierAdminDto(String tier, boolean enabled, int thresholdUah, int guaranteedPercent,
                               int guaranteedMaxUah, int swapPercent, int prizes, int livePrizes,
                               long avgPrizeMinor) {
    }

    public record TierRequest(Boolean enabled, Integer thresholdUah, Integer guaranteedPercent,
                              Integer guaranteedMaxUah, Integer swapPercent) {
    }

    public record CaseItemAdminDto(long id, String tier, String kind, String productId, String title, String imageUrl,
                                   long priceMinor, int stock, boolean productActive, int discountPercent,
                                   int discountUah, String rarity, int weight, double chancePercent, int sortOrder,
                                   boolean active) {
    }

    public record CaseItemRequest(String tier, String kind, String productId, Integer discountPercent,
                                  Integer discountUah, String rarity, Integer weight, Integer sortOrder,
                                  Boolean active) {
    }

    /**
     * Orders since {@code since} (30 days): with an automatic gift, with a case / of them opened, that
     * took the guaranteed discount instead, prizes swapped; per tier.
     */
    public record GiftStatsDto(Instant since, long orders, long giftOrders, long caseOrders, long casesOpened,
                               long guaranteedOrders, long guaranteedMinor, long swaps, long discountPrizes,
                               List<TierStatsDto> tiers) {
    }

    public record TierStatsDto(String tier, long cases, long opened, long guaranteed) {
    }

    /**
     * «Тест кейса» (POST /api/admin/gift/tiers/{tier}/test-draw): {@code count} draws of the checkout
     * algorithm with nothing saved — no order, code, stock or journal.
     *
     * @param won   the first draw (the prize of a single opening with the reel)
     * @param drops the first draws in order (up to {@link GiftService#TEST_DROPS_SHOWN})
     * @param reel  the tier's prizes that can drop now, for the reel of the opening screen
     * @param hits  how often each prize of the pool dropped, with its real chance (% of the pool)
     */
    public record TestDrawDto(String tier, int count, CaseItemDto won, List<CaseItemDto> drops,
                              List<CaseItemDto> reel, List<TestHitDto> hits) {
    }

    /** A prize of the test pool: {@code id} of gift_case_items, its drops and real chance, %. */
    public record TestHitDto(long id, String key, int hits, double chancePercent) {
    }
}
