package com.maxsolch.shop.bundle;

import com.maxsolch.shop.bundle.BundleDtos.OfferItemDto;
import com.maxsolch.shop.bundle.BundleDtos.ProductOfferDto;
import com.maxsolch.shop.bundle.BundleDtos.QuoteDto;
import com.maxsolch.shop.bundle.BundleDtos.QuoteLineDto;
import com.maxsolch.shop.bundle.BundleDtos.QuoteLineRequest;
import com.maxsolch.shop.bundle.BundleDtos.QuoteRequest;
import com.maxsolch.shop.bundle.BundleDtos.SlotDto;
import com.maxsolch.shop.bundle.BundleDtos.TermsDto;
import com.maxsolch.shop.catalog.CatalogDirectory;
import com.maxsolch.shop.catalog.CatalogSnapshot;
import com.maxsolch.shop.common.UuidUtil;
import com.maxsolch.shop.gift.GiftService;
import com.maxsolch.shop.service.CatalogService;
import com.maxsolch.shop.settings.SettingsRegistry;
import com.maxsolch.shop.settings.SettingsService;
import com.maxsolch.shop.web.dto.ProductDto;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ThreadLocalRandom;
import java.util.function.Function;

/**
 * «Вместе дешевле» (accessories with a discount next to a product), docs/BUNDLES.md.
 *
 * <p>Suggestions and the cart quote run over the cached catalog ({@link CatalogService}); the
 * checkout prices the bundle from the locked product rows through the same {@link BundlePricing},
 * so the cart and the order never disagree. Pairs of categories live in {@code bundle_rules} (add-ons)
 * and {@code bundle_setup_rules} («Собери сетап»), the margins in {@code bundle_category_margins},
 * the numbers in {@code shop_settings} (group {@code bundles}). What to offer — {@link BundleRanker}.
 */
@Service
public class BundleService {

    public static final String KIND_BUNDLE = "BUNDLE";
    public static final String KIND_PROMO = "PROMO";

    /** «Собери сетап»: at most this many other big items. */
    static final int MAX_SETUP_SLOTS = 3;

    private final BundleRuleRepository ruleRepository;
    private final BundleSetupRuleRepository setupRuleRepository;
    private final BundleCategoryMarginRepository marginRepository;
    private final BundlePairStatsService pairStats;
    private final SettingsService settings;
    private final CatalogDirectory directory;
    private final CatalogService catalogService;

    /** The gift for the order sum: its product is not offered for money (optional in unit tests). */
    private GiftService giftService;

    @org.springframework.beans.factory.annotation.Autowired(required = false)
    void setGiftService(GiftService giftService) {
        this.giftService = giftService;
    }

    public BundleService(BundleRuleRepository ruleRepository, BundleSetupRuleRepository setupRuleRepository,
                         BundleCategoryMarginRepository marginRepository, BundlePairStatsService pairStats,
                         SettingsService settings, CatalogDirectory directory, CatalogService catalogService) {
        this.ruleRepository = ruleRepository;
        this.setupRuleRepository = setupRuleRepository;
        this.marginRepository = marginRepository;
        this.pairStats = pairStats;
        this.settings = settings;
        this.directory = directory;
        this.catalogService = catalogService;
    }

    // ---- configuration ----

    /** Pricing terms with the margin caps and the setup pairs. */
    @Transactional(readOnly = true)
    public BundlePricing.Config config() {
        return config(margins());
    }

    BundlePricing.Config config(BundleMargins margins) {
        boolean setup = settings.getBool(SettingsRegistry.BUNDLE_SETUP_ENABLED);
        return new BundlePricing.Config(
                settings.getBool(SettingsRegistry.BUNDLE_ENABLED),
                List.of(settings.getInt(SettingsRegistry.BUNDLE_TIER1_PERCENT),
                        settings.getInt(SettingsRegistry.BUNDLE_TIER2_PERCENT),
                        settings.getInt(SettingsRegistry.BUNDLE_TIER3_PERCENT)),
                settings.getInt(SettingsRegistry.BUNDLE_MAX_ADDON_PRICE_PERCENT),
                settings.getInt(SettingsRegistry.BUNDLE_MAX_DISCOUNT_UAH) * 100L,
                margins::cap,
                setup ? setupRules() : List.of(),
                setup ? settings.getInt(SettingsRegistry.BUNDLE_SETUP_PERCENT) : 0);
    }

    public TermsDto terms() {
        return new TermsDto(
                settings.getBool(SettingsRegistry.BUNDLE_ENABLED),
                List.of(settings.getInt(SettingsRegistry.BUNDLE_TIER1_PERCENT),
                        settings.getInt(SettingsRegistry.BUNDLE_TIER2_PERCENT),
                        settings.getInt(SettingsRegistry.BUNDLE_TIER3_PERCENT)),
                settings.getInt(SettingsRegistry.BUNDLE_MAX_ADDON_PRICE_PERCENT),
                settings.getInt(SettingsRegistry.BUNDLE_MAX_DISCOUNT_UAH) * 100L,
                settings.getInt(SettingsRegistry.BUNDLE_HOLDOUT_PERCENT),
                settings.getBool(SettingsRegistry.BUNDLE_SETUP_ENABLED),
                settings.getInt(SettingsRegistry.BUNDLE_SETUP_PERCENT));
    }

    /** Active add-on rules in their order. */
    @Transactional(readOnly = true)
    public List<BundlePricing.Rule> rules() {
        return ruleRepository.findAllByOrderBySortOrderAscIdAsc().stream()
                .filter(BundleRule::isActive)
                .map(r -> new BundlePricing.Rule(UuidUtil.toString(r.getSourceCategoryId()),
                        UuidUtil.toString(r.getTargetCategoryId())))
                .toList();
    }

    /** Active «Собери сетап» pairs in their order. */
    @Transactional(readOnly = true)
    public List<BundlePricing.Rule> setupRules() {
        return setupRuleRepository.findAllByOrderBySortOrderAscIdAsc().stream()
                .filter(BundleSetupRule::isActive)
                .map(r -> new BundlePricing.Rule(UuidUtil.toString(r.getSourceCategoryId()),
                        UuidUtil.toString(r.getTargetCategoryId())))
                .toList();
    }

    /** The margin table with inheritance and the current settings. */
    @Transactional(readOnly = true)
    public BundleMargins margins() {
        Map<String, BundleMargins.Row> rows = new HashMap<>();
        for (BundleCategoryMargin m : marginRepository.findAll()) {
            rows.put(UuidUtil.toString(m.getCategoryId()),
                    new BundleMargins.Row(m.getMarginPercent(), m.getDiscountPercent(), m.getAutoPercent()));
        }
        CatalogSnapshot snap = directory.snapshot();
        return new BundleMargins(rows, id -> {
            CatalogSnapshot.Cat c = snap.category(id);
            return c == null ? null : c.parentId();
        }, settings.getInt(SettingsRegistry.GIFT_MARGIN_PERCENT),
                settings.getInt(SettingsRegistry.BUNDLE_SAFETY_MARGIN_PERCENT),
                settings.getBool(SettingsRegistry.BUNDLE_AUTO_TUNE));
    }

    /** The category and its ancestors, leaf first; empty for null / unknown ids. */
    public Function<String, List<String>> pathFunction() {
        CatalogSnapshot snap = directory.snapshot();
        Map<String, List<String>> memo = new HashMap<>();
        return id -> id == null ? List.of() : memo.computeIfAbsent(id, k -> {
            List<String> out = new ArrayList<>();
            String cur = k;
            // The tree is at most two levels; the bound only guards against a broken parent loop.
            for (int guard = 0; cur != null && guard < 8; guard++) {
                CatalogSnapshot.Cat c = snap.category(cur);
                if (c == null) {
                    break;
                }
                out.add(c.id());
                cur = c.parentId();
            }
            return out;
        });
    }

    // ---- checkout ----

    /** Prices the bundle of a cart for the checkout (lines built from the locked product rows). */
    @Transactional(readOnly = true)
    public BundlePricing.Result price(List<BundlePricing.Line> lines) {
        BundlePricing.Config cfg = config();
        if (!cfg.enabled()) {
            return BundlePricing.Result.EMPTY;
        }
        return BundlePricing.compute(lines, rules(), pathFunction(), cfg);
    }

    // ---- storefront ----

    /** Accessory slots and «Собери сетап» for the page of {@code productId}. */
    @Transactional(readOnly = true)
    public ProductOfferDto offerFor(String productId, String lang) {
        return offer(productId, lang, false, settings.getInt(SettingsRegistry.BUNDLE_EXPLORE_PERCENT), false);
    }

    /**
     * @param force     build the block even while the feature is off (admin preview)
     * @param withScore put the score factors into the items (admin preview)
     */
    @Transactional(readOnly = true)
    public ProductOfferDto offer(String productId, String lang, boolean withScore, int explorePercent, boolean force) {
        TermsDto terms = terms();
        List<ProductDto> all = catalogService.listActiveProducts(lang);
        ProductDto anchor = all.stream().filter(p -> p.id().equals(productId)).findFirst().orElse(null);
        if (anchor == null || (!terms.enabled() && !force)) {
            return ProductOfferDto.empty(productId, terms);
        }
        var path = pathFunction();
        BundleMargins margins = margins();
        String top = BundleRanker.top(anchor.categoryId(), path);
        Set<String> excludeTops = top == null ? Set.of() : Set.of(top);

        List<String> targets = targetsFor(anchor, rules(), path);
        List<SlotDto> slots = BundleRanker.slots(
                new BundleRanker.Request(anchor, targets, Set.of(productId), excludeTops, true,
                        terms.maxAddonPricePercent(), settings.getInt(SettingsRegistry.BUNDLE_MAX_SUGGESTIONS)),
                all, context(path, margins, margins::cap, withScore, explorePercent));

        List<SlotDto> setup = List.of();
        int anchorSetupPercent = 0;
        if (terms.setupEnabled()) {
            int setupPct = terms.setupPercent();
            setup = BundleRanker.slots(
                    new BundleRanker.Request(anchor, targetsFor(anchor, setupRules(), path), Set.of(productId),
                            excludeTops, false, 100, MAX_SETUP_SLOTS),
                    all, context(path, margins, c -> Math.min(setupPct, margins.cap(c)), withScore, 0));
            anchorSetupPercent = setup.isEmpty() ? 0 : Math.min(setupPct, margins.cap(anchor.categoryId()));
        }
        List<ProductDto> items = slots.stream().map(s -> s.primary().product()).toList();
        return new ProductOfferDto(productId, terms, items, slots, setup, anchorSetupPercent);
    }

    /** Cart quote: the bundle discount line by line, which discount wins, suggestions. */
    @Transactional(readOnly = true)
    public QuoteDto quote(QuoteRequest req, String lang) {
        TermsDto terms = terms();
        List<ProductDto> all = catalogService.listActiveProducts(lang);
        Map<String, ProductDto> byId = new HashMap<>();
        for (ProductDto p : all) {
            byId.put(p.id(), p);
        }

        // Duplicate lines are merged like the checkout does.
        Map<String, BundlePricing.Line> lines = new LinkedHashMap<>();
        Map<String, QuoteLineRequest> requested = new LinkedHashMap<>();
        List<ProductDto> inCart = new ArrayList<>();
        long subtotal = 0;
        if (req != null && req.lines() != null) {
            for (QuoteLineRequest l : req.lines()) {
                if (l == null || l.productId() == null || l.quantity() <= 0) {
                    continue;
                }
                ProductDto p = byId.get(l.productId());
                if (p == null) {
                    continue;
                }
                String key = key(l.productId(), l.variantId());
                int qty = Math.min(l.quantity(), 999);
                BundlePricing.Line prev = lines.get(key);
                lines.put(key, new BundlePricing.Line(key, p.categoryId(), p.priceMinor(),
                        (prev == null ? 0 : prev.quantity()) + qty));
                requested.putIfAbsent(key, l);
                if (inCart.stream().noneMatch(x -> x.id().equals(p.id()))) {
                    inCart.add(p);
                }
                subtotal += p.priceMinor() * qty;
            }
        }

        BundleMargins margins = margins();
        BundlePricing.Result r = terms.enabled()
                ? BundlePricing.compute(new ArrayList<>(lines.values()), rules(), pathFunction(), config(margins))
                : BundlePricing.Result.EMPTY;
        List<QuoteLineDto> qLines = r.lines().values().stream()
                .map(d -> {
                    QuoteLineRequest q = requested.get(d.key());
                    return new QuoteLineDto(q.productId(), blankToNull(q.variantId()), d.percent(), d.units(),
                            d.discountMinor(), d.kind());
                })
                .toList();

        long promo = req == null || req.promoDiscountMinor() == null ? 0 : Math.max(0, req.promoDiscountMinor());
        promo = Math.min(promo, subtotal);
        String kind = null;
        long discount = 0;
        if (r.discountMinor() > 0 && r.discountMinor() > promo) {
            kind = KIND_BUNDLE;
            discount = r.discountMinor();
        } else if (promo > 0) {
            kind = KIND_PROMO;
            discount = promo;
        }
        long total = Math.max(0, subtotal - discount);

        List<OfferItemDto> offers = terms.enabled() && !inCart.isEmpty()
                ? cartOffers(inCart, all, margins, settings.getInt(SettingsRegistry.BUNDLE_MAX_SUGGESTIONS))
                : List.of();
        List<ProductDto> suggestions = offers.stream().map(OfferItemDto::product).toList();

        return new QuoteDto(subtotal, r.discountMinor(), r.percent(), qLines, kind, discount, total,
                suggestions, terms, offers);
    }

    /**
     * Accessories for a cart: the slot primaries of each cart product, dearest first, one per kind of
     * accessory; categories already in the cart are skipped.
     */
    List<OfferItemDto> cartOffers(List<ProductDto> inCart, List<ProductDto> all, BundleMargins margins, int limit) {
        var path = pathFunction();
        List<BundlePricing.Rule> rules = rules();
        if (rules.isEmpty() || limit <= 0) {
            return List.of();
        }
        Set<String> exclude = new HashSet<>();
        Set<String> tops = new HashSet<>();
        for (ProductDto p : inCart) {
            exclude.add(p.id());
            String t = BundleRanker.top(p.categoryId(), path);
            if (t != null) {
                tops.add(t);
            }
        }
        List<ProductDto> anchors = new ArrayList<>(inCart);
        anchors.sort(Comparator.comparingLong(ProductDto::priceMinor).reversed());
        BundleRanker.Context ctx = context(path, margins, margins::cap, false, 0);
        int maxPct = settings.getInt(SettingsRegistry.BUNDLE_MAX_ADDON_PRICE_PERCENT);
        List<OfferItemDto> out = new ArrayList<>();
        for (ProductDto anchor : anchors) {
            if (out.size() >= limit) {
                break;
            }
            List<SlotDto> slots = BundleRanker.slots(new BundleRanker.Request(anchor, targetsFor(anchor, rules, path),
                    exclude, tops, true, maxPct, limit - out.size()), all, ctx);
            for (SlotDto s : slots) {
                out.add(s.primary());
                exclude.add(s.primary().product().id());
                String t = BundleRanker.top(s.categoryId(), path);
                if (t != null) {
                    tops.add(t);
                }
            }
        }
        return out;
    }

    BundleRanker.Context context(Function<String, List<String>> path, BundleMargins margins,
                                 Function<String, Integer> discountFor, boolean withScore, int explorePercent) {
        String giftId = giftService == null ? null
                : giftService.giftConfig().map(GiftService.GiftConfig::productId).orElse(null);
        return new BundleRanker.Context(path, pairStats.current(), margins, discountFor, discountFor, giftId,
                withScore, explorePercent, () -> ThreadLocalRandom.current().nextInt(100));
    }

    /** Targets of the rules whose source is the anchor's category or an ancestor, in rule order. */
    static List<String> targetsFor(ProductDto anchor, List<BundlePricing.Rule> rules,
                                   Function<String, List<String>> path) {
        List<String> anchorPath = path.apply(anchor.categoryId());
        if (anchorPath.isEmpty()) {
            return List.of();
        }
        List<String> out = new ArrayList<>();
        for (BundlePricing.Rule r : rules) {
            if (anchorPath.contains(r.sourceCategoryId()) && !out.contains(r.targetCategoryId())) {
                out.add(r.targetCategoryId());
            }
        }
        return out;
    }

    public static String key(String productId, String variantId) {
        return productId + "::" + (variantId == null ? "" : variantId);
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s;
    }
}
