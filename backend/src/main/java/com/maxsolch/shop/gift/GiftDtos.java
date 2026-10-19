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
     * @param swapPercent        the swap gives this % of the prize's price as a code (0 = no swap)
     * @param promoValidDays     how long a code from this tier's case (a discount prize, a swap) is valid
     * @param prizes             what can drop, most common first — without chances (never shown)
     */
    public record TierInfoDto(String tier, long thresholdMinor, int guaranteedPercent, long guaranteedMaxMinor,
                              boolean swap, int swapPercent, int promoValidDays, List<CaseItemDto> prizes) {
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
                              PromoDto promo, SwapDto swap, SizeDto size) {
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
    /** @param lowMargin admin only (null for the customer): the case was drawn leaning to discounts */
    public record OrderGiftDto(String tier, long guaranteedDiscountMinor, String caseStatus, boolean openable,
                               CaseItemDto prize, PromoDto promo, SwapDto swap, SizeDto size, Boolean lowMargin) {
    }

    // ---- admin ----

    /**
     * @param avgPrizeMinor  average product prize by the real chances (retail)
     * @param marginPercent  gift.marginPercent — the shop's average margin, for the prize cost in the admin
     * @param monthlyOrders  orders per month whose total falls into this tier (last 90 days) — expected cases
     * @param lowMarginProductPercent share of product prizes in an order with a low-margin product, %
     */
    public record TierAdminDto(String tier, boolean enabled, int thresholdUah, int guaranteedPercent,
                               int guaranteedMaxUah, int swapPercent, int promoValidDays, int prizes,
                               int livePrizes, long avgPrizeMinor, int marginPercent, double monthlyOrders,
                               int lowMarginProductPercent) {
    }

    /**
     * Products with the case leaning to discounts (GET/PUT /api/admin/gift/low-margin): whole brands and
     * single products; {@code productCount} — every product they cover.
     */
    public record LowMarginDto(List<LowMarginBrandDto> brands, List<LowMarginProductDto> products, int productCount) {
    }

    public record LowMarginBrandDto(String slug, String name, long productCount) {
    }

    public record LowMarginProductDto(String id, String title, String imageUrl, long priceMinor) {
    }

    /** PUT /api/admin/gift/low-margin: the whole lists (brand slugs, product ids). */
    public record LowMarginRequest(List<String> brands, List<String> products) {
    }

    /**
     * A prize of a case draft (the admin's case builder): what «Опубликовать» saves for a tier, what the
     * test draws from and what «Автособрать» proposes. {@code id} — an existing gift_case_items row (kept
     * on publish), null for a new prize.
     */
    public record CaseDraftItem(Long id, String kind, String productId, Integer discountPercent, Integer discountUah,
                                String rarity, Integer weight, Boolean active) {
    }

    /** PUT /api/admin/gift/tiers/{tier}/items, POST …/test-draw (optional body). */
    public record CaseDraftRequest(List<CaseDraftItem> items) {
    }

    /**
     * «Автособрать» (POST /api/admin/gift/tiers/{tier}/autofill). Everything optional: defaults by tier
     * and the gift.* settings.
     *
     * @param prizes          how many prizes (4…14), with the jackpot
     * @param costShare       % of the shop's margin on an order at the threshold an average prize may cost
     * @param marginPercent   the shop's average margin, % (gift.marginPercent)
     * @param discounts       how many discount prizes (0…4)
     * @param categories      root category slugs of ordinary prizes (gift.caseCategories)
     * @param superCategories root category slugs of the jackpot (gift.caseSuperCategories; gold only)
     * @param jackpot         a super prize (gold tier only)
     * @param newOnly         only new products (not markdown / used)
     * @param minStock        a product prize needs at least this many units
     * @param locked          prizes to keep (the chances are recounted)
     * @param seed            another seed = another set
     */
    public record AutofillRequest(Integer prizes, Integer costShare, Integer marginPercent, Integer discounts,
                                  List<String> categories, List<String> superCategories, Boolean jackpot,
                                  Boolean newOnly, Integer minStock, List<CaseDraftItem> locked, Long seed) {
    }

    /** A prize of a draft with what the admin shows; {@code id} null = new. */
    public record DraftItemDto(Long id, String kind, String productId, String title, String imageUrl, long priceMinor,
                               int stock, boolean productActive, String category, int discountPercent,
                               int discountUah, String rarity, int weight, boolean active) {
    }

    /**
     * What «Автособрать» proposes (nothing saved).
     *
     * @param avgPrizeMinor   average prize, retail (discounts by their ₴)
     * @param avgCostMinor    average prize cost to the shop (products × (100 − margin) %, discounts in full)
     * @param marginMinor     the shop's margin on an order at the threshold
     * @param targetCostMinor what the average cost aimed at
     * @param warnings        what did not fit (few products in a price range, a prize runs out…)
     */
    public record AutofillDto(String tier, List<DraftItemDto> items, long avgPrizeMinor, long avgCostMinor,
                              long marginMinor, long targetCostMinor, List<String> warnings) {
    }

    public record TierRequest(Boolean enabled, Integer thresholdUah, Integer guaranteedPercent,
                              Integer guaranteedMaxUah, Integer swapPercent, Integer promoValidDays,
                              Integer lowMarginProductPercent) {
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
