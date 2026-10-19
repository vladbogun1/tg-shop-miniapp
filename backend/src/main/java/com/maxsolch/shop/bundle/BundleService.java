package com.maxsolch.shop.bundle;

import com.maxsolch.shop.bundle.BundleDtos.ProductOfferDto;
import com.maxsolch.shop.bundle.BundleDtos.QuoteDto;
import com.maxsolch.shop.bundle.BundleDtos.QuoteLineDto;
import com.maxsolch.shop.bundle.BundleDtos.QuoteLineRequest;
import com.maxsolch.shop.bundle.BundleDtos.QuoteRequest;
import com.maxsolch.shop.bundle.BundleDtos.TermsDto;
import com.maxsolch.shop.catalog.CatalogDirectory;
import com.maxsolch.shop.catalog.CatalogSnapshot;
import com.maxsolch.shop.common.UuidUtil;
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

/**
 * «Вместе дешевле» (accessories with a discount next to a product), docs/BUNDLES.md.
 *
 * <p>Suggestions and the cart quote run over the cached catalog ({@link CatalogService}); the
 * checkout prices the bundle from the locked product rows through the same {@link BundlePricing},
 * so the cart and the order never disagree. Pairs of categories live in {@code bundle_rules}, the
 * numbers in {@code shop_settings} (group {@code bundles}).
 */
@Service
public class BundleService {

    public static final String KIND_BUNDLE = "BUNDLE";
    public static final String KIND_PROMO = "PROMO";

    private final BundleRuleRepository ruleRepository;
    private final SettingsService settings;
    private final CatalogDirectory directory;
    private final CatalogService catalogService;

    public BundleService(BundleRuleRepository ruleRepository, SettingsService settings,
                         CatalogDirectory directory, CatalogService catalogService) {
        this.ruleRepository = ruleRepository;
        this.settings = settings;
        this.directory = directory;
        this.catalogService = catalogService;
    }

    // ---- configuration ----

    public BundlePricing.Config config() {
        return new BundlePricing.Config(
                settings.getBool(SettingsRegistry.BUNDLE_ENABLED),
                List.of(settings.getInt(SettingsRegistry.BUNDLE_TIER1_PERCENT),
                        settings.getInt(SettingsRegistry.BUNDLE_TIER2_PERCENT),
                        settings.getInt(SettingsRegistry.BUNDLE_TIER3_PERCENT)),
                settings.getInt(SettingsRegistry.BUNDLE_MAX_ADDON_PRICE_PERCENT),
                settings.getInt(SettingsRegistry.BUNDLE_MAX_DISCOUNT_UAH) * 100L);
    }

    public TermsDto terms() {
        BundlePricing.Config c = config();
        return new TermsDto(c.enabled(), c.tiers(), c.maxAddonPricePercent(), c.maxDiscountMinor());
    }

    /** Active rules in their order. */
    @Transactional(readOnly = true)
    public List<BundlePricing.Rule> rules() {
        return ruleRepository.findAllByOrderBySortOrderAscIdAsc().stream()
                .filter(BundleRule::isActive)
                .map(r -> new BundlePricing.Rule(UuidUtil.toString(r.getSourceCategoryId()),
                        UuidUtil.toString(r.getTargetCategoryId())))
                .toList();
    }

    /** The category and its ancestors, leaf first; empty for null / unknown ids. */
    public java.util.function.Function<String, List<String>> pathFunction() {
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

    /** Accessories to offer on the page of {@code productId}. */
    @Transactional(readOnly = true)
    public ProductOfferDto offerFor(String productId, String lang) {
        TermsDto terms = terms();
        List<ProductDto> all = catalogService.listActiveProducts(lang);
        ProductDto anchor = all.stream().filter(p -> p.id().equals(productId)).findFirst().orElse(null);
        if (anchor == null) {
            return new ProductOfferDto(productId, terms, List.of());
        }
        if (!terms.enabled()) {
            return new ProductOfferDto(productId, terms, List.of());
        }
        List<ProductDto> items = suggest(List.of(anchor), all, Set.of(productId), terms.maxAddonPricePercent(),
                settings.getInt(SettingsRegistry.BUNDLE_MAX_SUGGESTIONS));
        return new ProductOfferDto(productId, terms, items);
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
                if (prev == null) {
                    inCart.add(p);
                }
                subtotal += p.priceMinor() * qty;
            }
        }

        BundlePricing.Result r = terms.enabled()
                ? BundlePricing.compute(new ArrayList<>(lines.values()), rules(), pathFunction(), config())
                : BundlePricing.Result.EMPTY;
        List<QuoteLineDto> qLines = r.lines().values().stream()
                .map(d -> {
                    QuoteLineRequest q = requested.get(d.key());
                    return new QuoteLineDto(q.productId(), blankToNull(q.variantId()), d.percent(), d.units(),
                            d.discountMinor());
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

        Set<String> exclude = new HashSet<>();
        inCart.forEach(p -> exclude.add(p.id()));
        List<ProductDto> suggestions = terms.enabled() && !inCart.isEmpty()
                ? suggest(inCart, all, exclude, terms.maxAddonPricePercent(),
                        settings.getInt(SettingsRegistry.BUNDLE_MAX_SUGGESTIONS))
                : List.of();

        return new QuoteDto(subtotal, r.discountMinor(), r.percent(), qLines, kind, discount, total,
                suggestions, terms);
    }

    /**
     * Up to {@code limit} accessories for {@code anchors}: for each anchor (dearest first) and each of
     * its rules in order, the best-selling product of the target category that is in stock, cheap
     * enough and not in the cart — one per rule per round, so a mouse gets glides AND a mat before a
     * second pair of glides. Categories already in the cart are skipped.
     */
    List<ProductDto> suggest(List<ProductDto> anchors, List<ProductDto> all, Set<String> exclude,
                             int maxAddonPricePercent, int limit) {
        List<BundlePricing.Rule> rules = rules();
        if (rules.isEmpty() || anchors.isEmpty() || limit <= 0) {
            return List.of();
        }
        var path = pathFunction();
        int pct = Math.max(1, Math.min(100, maxAddonPricePercent));
        Set<String> cartLeafCategories = new HashSet<>();
        anchors.forEach(a -> {
            if (a.categoryId() != null) {
                cartLeafCategories.add(a.categoryId());
            }
        });

        // Candidate queues, one per (anchor, rule), best first.
        List<List<ProductDto>> queues = new ArrayList<>();
        List<ProductDto> sortedAnchors = new ArrayList<>(anchors);
        sortedAnchors.sort(Comparator.comparingLong(ProductDto::priceMinor).reversed());
        Set<String> seenTargets = new HashSet<>();
        for (ProductDto anchor : sortedAnchors) {
            List<String> anchorPath = path.apply(anchor.categoryId());
            if (anchorPath.isEmpty()) {
                continue;
            }
            for (BundlePricing.Rule rule : rules) {
                if (!anchorPath.contains(rule.sourceCategoryId()) || !seenTargets.add(rule.targetCategoryId())) {
                    continue;
                }
                List<ProductDto> q = all.stream()
                        .filter(p -> !exclude.contains(p.id()))
                        .filter(p -> p.effectiveStock() > 0 && p.priceMinor() > 0)
                        .filter(p -> p.categoryId() != null && !cartLeafCategories.contains(p.categoryId()))
                        .filter(p -> path.apply(p.categoryId()).contains(rule.targetCategoryId()))
                        .filter(p -> p.priceMinor() < anchor.priceMinor()
                                && p.priceMinor() * 100 <= anchor.priceMinor() * pct)
                        .sorted(Comparator.comparingLong(ProductDto::soldCount).reversed()
                                .thenComparing(Comparator.comparingInt(ProductDto::ratingCount).reversed())
                                .thenComparing(ProductDto::priceMinor))
                        .toList();
                if (!q.isEmpty()) {
                    queues.add(new ArrayList<>(q));
                }
            }
        }

        List<ProductDto> out = new ArrayList<>();
        Set<String> picked = new HashSet<>();
        boolean progress = true;
        while (out.size() < limit && progress) {
            progress = false;
            for (List<ProductDto> q : queues) {
                while (!q.isEmpty() && picked.contains(q.get(0).id())) {
                    q.remove(0);
                }
                if (!q.isEmpty() && out.size() < limit) {
                    ProductDto p = q.remove(0);
                    picked.add(p.id());
                    out.add(p);
                    progress = true;
                }
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
