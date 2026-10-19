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
     * and 3 add-ons (each add-on is further capped by its own {@link OfferItemDto#capPercent()}), the
     * add-on price limit and the per-order cap (0 = none). 2.0: {@code holdoutPercent} — the share of
     * visitors (by a stable id, see shared/src/bundle.ts) who do not see the block; {@code setupPercent}
     * — the percent on the cheaper big item of «Собери сетап» (capped as well).
     */
    public record TermsDto(boolean enabled, List<Integer> tiers, int maxAddonPricePercent, long maxDiscountMinor,
                           int holdoutPercent, boolean setupEnabled, int setupPercent) {
    }

    /**
     * Score of a candidate (admin preview only): the product of the factors, docs/BUNDLES.md «Подбор».
     */
    public record ScoreDto(double total, double pair, double demand, double match, double price, double stock,
                           double margin) {
    }

    /**
     * One offered product. {@code capPercent}: the most percent it can get as an add-on (the margin cap);
     * {@code reasons}: COLOR_MATCH | HIT | LAST_ONE; {@code kind} of an alternative: COLOR_MATCH |
     * CHEAPER | OTHER_BRAND (null for the primary and color variants). {@code score}: admin only.
     */
    public record OfferItemDto(ProductDto product, int capPercent, List<String> reasons, String kind,
                               ScoreDto score) {
    }

    /**
     * A slot = one kind of accessory (one target category): the primary product, other colors of the
     * same model, up to two alternatives. {@code pairPercent}: how often orders with the anchor's
     * category also hold this one (0 = too few orders to say). {@code explore}: the primary is the
     * second best this time (measurement).
     */
    public record SlotDto(String categoryId, String categoryName, int pairPercent, boolean explore,
                          OfferItemDto primary, List<OfferItemDto> colors, List<OfferItemDto> alternatives) {
    }

    /**
     * Product page. {@code items}: the slot primaries (1.0 clients); {@code slots}: accessories;
     * {@code setup}: «Собери сетап» — other big items in a matching color (shown to everyone), their
     * {@code capPercent} is already the setup percent; {@code anchorSetupPercent} — the same for the
     * product itself (it gets it when a dearer setup item is taken).
     */
    public record ProductOfferDto(String productId, TermsDto terms, List<ProductDto> items, List<SlotDto> slots,
                                  List<SlotDto> setup, int anchorSetupPercent) {
        public static ProductOfferDto empty(String productId, TermsDto terms) {
            return new ProductOfferDto(productId, terms, List.of(), List.of(), List.of(), 0);
        }
    }

    public record QuoteLineRequest(String productId, String variantId, int quantity) {
    }

    /**
     * Cart quote. {@code promoDiscountMinor}: what the customer's promo code gives (the clients already
     * preview it) — only to say which of the two discounts wins; the checkout decides it again itself.
     */
    public record QuoteRequest(List<QuoteLineRequest> lines, Long promoDiscountMinor) {
    }

    /** One discounted line of the cart. {@code kind}: ADDON | SETUP. */
    public record QuoteLineDto(String productId, String variantId, int percent, int units, long discountMinor,
                               String kind) {
    }

    /**
     * @param discountKind BUNDLE | PROMO | null — the discount the order will get (only one of them)
     * @param suggestions  accessories for what is in the cart (not already there)
     * @param offers       the same with their caps and reasons (2.0 clients)
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
                           List<OfferItemDto> offers) {
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

    /**
     * A category row of the margin table. {@code marginPercent} / {@code discountPercent} — what the
     * owner entered for this very category (null = inherited / automatic); {@code effective*} — what
     * applies after inheritance; {@code capPercent} — the discount an accessory of it gets at most.
     */
    public record MarginDto(String categoryId, String categoryName, String parentId, Integer marginPercent,
                            Integer discountPercent, Integer autoPercent, Instant autoUpdatedAt,
                            int effectiveMarginPercent, int maxPercent, int capPercent, String capSource) {
    }

    public record MarginRequest(String categoryId, Integer marginPercent, Integer discountPercent) {
    }

    /** A pair of top categories from the orders (180 days). {@code ruleId}: the matching pair, if any. */
    public record PairStatDto(String sourceCategoryId, String sourceCategoryName, String targetCategoryId,
                              String targetCategoryName, int anchorOrders, int together, double rate,
                              Long ruleId, boolean ruleActive, boolean setupRule, boolean suggested) {
    }

    /** Funnel of one group: B — sees the block, H — the control group. */
    public record FunnelGroupDto(String group, long visitors, long withOffer, long added, long ordered,
                                 long addonOrders, long orders) {
    }

    /**
     * {@code liftPercent}: how much more often B ordered an accessory than H (null while either group
     * has under {@code minVisitors}); {@code bySlot}: adds by slot position and kind.
     */
    public record FunnelDto(Instant since, List<FunnelGroupDto> groups, Double liftPercent, int minVisitors,
                            List<SlotStatDto> bySlot, long explores, long exploreAdds) {
    }

    public record SlotStatDto(String key, long views, long adds) {
    }

    /** Auto-tune result of one category: d* = m/2 − (1+r)/(2e), clamped to 0..m−safety. */
    public record AutoTuneRowDto(String categoryId, String categoryName, int marginPercent, int oldPercent,
                                 int newPercent, boolean manual) {
    }

    public record AutoTuneDto(Instant at, double liftUsed, String liftSource, double responsePerPoint,
                              List<AutoTuneRowDto> rows) {
    }

    /** Forecast for a month: three scenarios of how the customers respond. */
    public record ForecastScenarioDto(String key, String label, double response, long addonOrders,
                                      long extraAddonOrders, long revenueMinor, long discountMinor,
                                      long profitMinor) {
    }

    public record ForecastDto(long ordersPerMonth, double baseAttachRate, long avgAddonMinor, int avgPercent,
                              int avgMarginPercent, List<ForecastScenarioDto> scenarios) {
    }

    /** {@code level}: WARN | INFO. */
    public record WarningDto(String level, String code, String text, String productId, String categoryId) {
    }

    public record SetupRuleDto(long id, String sourceCategoryId, String sourceCategoryName,
                               String targetCategoryId, String targetCategoryName, int sortOrder, boolean active) {
    }
}
