package com.maxsolch.shop.bundle;

import com.maxsolch.shop.web.dto.ProductDto;

import java.time.Instant;
import java.util.List;

/** API of «Вместе дешевле» (docs/BUNDLES.md). */
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
                           TermsDto terms) {
    }

    // ---- admin ----

    public record RuleDto(long id, String sourceCategoryId, String sourceCategoryName,
                          String targetCategoryId, String targetCategoryName, int sortOrder, boolean active) {
    }

    public record RuleRequest(String sourceCategoryId, String targetCategoryId, Integer sortOrder, Boolean active) {
    }

    /** Orders since {@code since} (30 days): with the bundle discount, the discount, their revenue. */
    public record StatsDto(Instant since,
                           long orders,
                           long bundleOrders,
                           long bundleDiscountMinor,
                           long bundleRevenueMinor) {
    }
}
