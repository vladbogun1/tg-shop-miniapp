package com.maxsolch.shop.bundle;

import com.maxsolch.shop.web.dto.ProductDto;

import java.time.Instant;
import java.util.List;

/** API of «Вместе дешевле» and the gift for the order sum. */
public final class BundleDtos {

    private BundleDtos() {
    }

    /**
     * What the clients need to price a bundle themselves on the product page: the percent for 1, 2
     * and 3 add-ons, the add-on price limit and the per-order cap (0 = none).
     */
    public record TermsDto(boolean enabled, List<Integer> tiers, int maxAddonPricePercent, long maxDiscountMinor) {
    }

    /** Product page: the accessories to offer with {@code productId}; empty when none fit. */
    public record ProductOfferDto(String productId, TermsDto terms, List<ProductDto> items) {
    }

    public record QuoteLineRequest(String productId, String variantId, int quantity) {
    }

    /**
     * Cart quote. {@code promoDiscountMinor}: what the customer's promo code gives (the clients already
     * preview it) — only to say which of the two discounts wins; the checkout decides it again itself.
     */
    public record QuoteRequest(List<QuoteLineRequest> lines, Long promoDiscountMinor) {
    }

    /** One add-on line of the cart with its share of the bundle discount. */
    public record QuoteLineDto(String productId, String variantId, int percent, int units, long discountMinor) {
    }

    /**
     * Gift for the order sum; null in the quote when switched off or the gift is out of stock.
     * {@code remainingMinor}: still to add to the cart (after the discount) for the gift; 0 = reached.
     */
    public record GiftDto(long thresholdMinor, long remainingMinor, boolean reached,
                          /** PRODUCT: the gift; null for a case. */
                          ProductDto product,
                          /** PRODUCT | CASE (a random prize from {@code caseItems}). */
                          String kind,
                          List<CaseItemDto> caseItems) {
    }

    /** A prize of the gift case as the customer sees it; {@code chancePercent} among the prizes in stock. */
    public record CaseItemDto(String productId, String title, String imageUrl, long priceMinor,
                              String rarity, double chancePercent) {
    }

    /**
     * Opening the case of an order: the prize (fixed at checkout) and the prizes for the reel.
     * Opening again replays the same prize.
     */
    public record CaseOpenDto(String status, CaseItemDto won, List<CaseItemDto> reel) {
    }

    // ---- admin: case prizes ----

    public record CaseItemAdminDto(long id, String productId, String title, String imageUrl, long priceMinor,
                                   int stock, boolean productActive, String rarity, int weight,
                                   double chancePercent, int sortOrder, boolean active) {
    }

    public record CaseItemRequest(String productId, String rarity, Integer weight, Integer sortOrder, Boolean active) {
    }

    /**
     * @param discountKind BUNDLE | PROMO | null — the discount the order will get (only one of them)
     * @param suggestions  accessories for what is in the cart (not already there)
     */
    public record QuoteDto(long subtotalMinor,
                           long bundleDiscountMinor,
                           int bundlePercent,
                           List<QuoteLineDto> lines,
                           String discountKind,
                           long discountMinor,
                           long totalMinor,
                           List<ProductDto> suggestions,
                           TermsDto terms,
                           GiftDto gift) {
    }

    // ---- admin ----

    public record RuleDto(long id, String sourceCategoryId, String sourceCategoryName,
                          String targetCategoryId, String targetCategoryName, int sortOrder, boolean active) {
    }

    public record RuleRequest(String sourceCategoryId, String targetCategoryId, Integer sortOrder, Boolean active) {
    }

    /** Orders since {@code since} (30 days): with the bundle discount, with the automatic gift. */
    public record StatsDto(Instant since,
                           long orders,
                           long bundleOrders,
                           long bundleDiscountMinor,
                           long bundleRevenueMinor,
                           long giftOrders,
                           /** Orders with a gift case / of them opened by the customer. */
                           long caseOrders,
                           long casesOpened) {
    }
}
