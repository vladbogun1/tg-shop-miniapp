package com.maxsolch.shop.gift.app;

import com.maxsolch.shop.gift.domain.GiftError;
import static com.maxsolch.shop.gift.app.CaseAutofillPlan.*;
import com.maxsolch.shop.gift.app.CaseAutofillPlan.Candidate;
import com.maxsolch.shop.gift.app.CaseAutofillPlan.Input;
import com.maxsolch.shop.promo.app.CaseLowMargin;

import com.maxsolch.shop.gift.domain.GiftCaseItem;
import com.maxsolch.shop.gift.domain.GiftCaseTier;
import com.maxsolch.shop.gift.infra.GiftCaseTierRepository;

import com.maxsolch.shop.catalog.domain.Category;
import com.maxsolch.shop.catalog.app.Taxonomy;
import com.maxsolch.shop.platform.util.UuidUtil;
import com.maxsolch.shop.gift.app.GiftDtos.AutofillDto;
import com.maxsolch.shop.gift.app.GiftDtos.AutofillRequest;
import com.maxsolch.shop.gift.app.GiftDtos.CaseDraftItem;
import com.maxsolch.shop.gift.app.GiftDtos.DraftItemDto;
import com.maxsolch.shop.catalog.app.CatalogService;
import com.maxsolch.shop.platform.settings.SettingsRegistry;
import com.maxsolch.shop.platform.settings.SettingsService;
import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.catalog.app.ProductDto;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.SplittableRandom;

/**
 * «Автособрать» of the case builder (docs/GIFT-CASE.md, «Конструктор»): picks prizes for a tier from the
 * catalog by price bands relative to the tier's threshold and sets chances so that the expected cost of a
 * case is a chosen share of the margin on an order at the threshold. Nothing is saved: the result is a
 * draft the admin edits and publishes.
 *
 * <p>No cost price in the shop: a product prize costs {@code price × (1 − margin)}, a discount prize its
 * full amount (a percent one — that percent of the threshold).
 */
@Service
public class CaseAutofill {

    private static final String ADMIN_LANG = "ru";
static final int TOTAL_WEIGHT = CaseAutofillPlan.TOTAL_WEIGHT;

    private final CatalogService catalogService;
    private final Taxonomy categoryRepository;
    private final GiftCaseTierRepository tierRepository;
    private final SettingsService settings;
    private final AdminGiftService adminGift;

    /** Low-margin products: never proposed as prizes (a prize costs the shop its full price). */
    private final CaseLowMargin lowMargin;

    private Set<String> lowMarginIds() {
        return lowMargin.none() ? Set.of() : lowMargin.productIds();
    }

    public CaseAutofill(CatalogService catalogService, Taxonomy categoryRepository,
                        GiftCaseTierRepository tierRepository, SettingsService settings, AdminGiftService adminGift,
                        CaseLowMargin lowMargin) {
        this.catalogService = catalogService;
        this.lowMargin = lowMargin;
        this.categoryRepository = categoryRepository;
        this.tierRepository = tierRepository;
        this.settings = settings;
        this.adminGift = adminGift;
    }

    @Transactional(readOnly = true)
    public AutofillDto autofill(String code, AutofillRequest body) {
        AutofillRequest req = body != null ? body
                : new AutofillRequest(null, null, null, null, null, null, null, null, null, null, null);
        GiftCaseTier t = tierOf(code);
        int margin = clamp(req.marginPercent() != null ? req.marginPercent()
                : settings.getInt(SettingsRegistry.GIFT_MARGIN_PERCENT), 1, 90);
        int costShare = clamp(req.costShare() != null ? req.costShare() : defaultCostShare(t.getTier()), 5, 150);
        int prizes = clamp(req.prizes() != null ? req.prizes() : 8, 3, 20);
        int discounts = clamp(req.discounts() != null ? req.discounts() : 2, 0, prizes / 2);
        boolean jackpot = t.getTier() == GiftCaseTier.Tier.GOLD && (req.jackpot() == null || req.jackpot());
        boolean newOnly = req.newOnly() == null || req.newOnly();
        int minStock = clamp(req.minStock() != null ? req.minStock() : 2, 1, 1000);
        Set<String> cats = slugs(req.categories(), SettingsRegistry.GIFT_CASE_CATEGORIES);
        Set<String> superCats = slugs(req.superCategories(), SettingsRegistry.GIFT_CASE_SUPER_CATEGORIES);

        Map<String, ProductDto> byId = new HashMap<>();
        List<ProductDto> products = catalogService.listActiveProducts(ADMIN_LANG);
        products.forEach(p -> byId.put(p.id(), p));
        List<DraftItemDto> locked = new ArrayList<>();
        Set<String> lockedProducts = new HashSet<>();
        for (CaseDraftItem d : req.locked() == null ? List.<CaseDraftItem>of() : req.locked()) {
            DraftItemDto x = fromDraft(d, byId);
            locked.add(x);
            if (x.productId() != null) {
                lockedProducts.add(x.productId());
            }
        }
        Map<String, Category> categories = categories();
        List<Candidate> pool = new ArrayList<>();
        List<Candidate> superPool = new ArrayList<>();
        Set<String> lowMarginIds = lowMarginIds();
        for (ProductDto p : products) {
            if (!usable(p, newOnly) || lockedProducts.contains(p.id()) || lowMarginIds.contains(p.id())) {
                continue;
            }
            Category root = root(p.categoryId(), categories);
            String slug = root == null ? "" : root.getSlug();
            Candidate c = new Candidate(p, slug, root == null ? "" : root.getName());
            if (cats.contains(slug) && p.effectiveStock() >= minStock) {
                pool.add(c);
            }
            if (superCats.contains(slug)) {
                superPool.add(c);
            }
        }
        long seed = req.seed() != null ? req.seed() : new SplittableRandom().nextLong();
        AutofillDto out = build(new Input(t.getTier(), t.thresholdMinor(), margin, costShare, prizes, discounts,
                jackpot, pool, superPool, locked, seed,
                adminGift.monthlyOrders().getOrDefault(t.getTier(), 0.0)));
        return withStockWarnings(out);
    }

    /** Products of a rarity's price band for a tier, best first (the «Заменить» list). */
    @Transactional(readOnly = true)
    public List<DraftItemDto> alternatives(String code, String rarityCode, List<String> exclude) {
        GiftCaseTier t = tierOf(code);
        GiftCaseItem.Rarity rarity;
        try {
            rarity = GiftCaseItem.Rarity.valueOf(rarityCode.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException | NullPointerException e) {
            throw new DomainException.BadRequest(GiftError.UNKNOWN_RARITY, rarityCode);
        }
        Set<String> skip = new HashSet<>();
        exclude.forEach(e -> skip.add(e.trim().toLowerCase(Locale.ROOT)));
        Set<String> cats = new HashSet<>(slugs(null, SettingsRegistry.GIFT_CASE_CATEGORIES));
        if (rarity == GiftCaseItem.Rarity.GOLD || rarity == GiftCaseItem.Rarity.LEGENDARY) {
            cats.addAll(slugs(null, SettingsRegistry.GIFT_CASE_SUPER_CATEGORIES));
        }
        Map<String, Category> categories = categories();
        double[] band = BANDS.get(rarity);
        long lo = Math.round(t.thresholdMinor() * band[0] * 0.67);
        long hi = Math.round(t.thresholdMinor() * band[1] * 1.5);
        List<Candidate> list = new ArrayList<>();
        Set<String> lowMarginIds = lowMarginIds();
        for (ProductDto p : catalogService.listActiveProducts(ADMIN_LANG)) {
            if (!usable(p, false) || skip.contains(p.id()) || lowMarginIds.contains(p.id())
                    || p.priceMinor() < lo || p.priceMinor() >= hi) {
                continue;
            }
            Category root = root(p.categoryId(), categories);
            if (root != null && cats.contains(root.getSlug())) {
                list.add(new Candidate(p, root.getSlug(), root.getName()));
            }
        }
        double maxSold = list.stream().mapToDouble(c -> c.p().soldCount()).max().orElse(0);
        long T = t.thresholdMinor();
        return list.stream()
                .sorted(Comparator.comparingDouble((Candidate c) -> -score(c, rarity, T, maxSold, 0)))
                .limit(40)
                .map(c -> productItem(c, rarity, 0))
                .toList();
    }

    // ---- helpers ----

    private AutofillDto withStockWarnings(AutofillDto dto) {
        double monthly = adminGift.monthlyOrders().getOrDefault(GiftCaseTier.Tier.valueOf(dto.tier()), 0.0);
        if (monthly <= 0) {
            return dto;
        }
        List<String> warnings = new ArrayList<>(dto.warnings());
        for (DraftItemDto x : dto.items()) {
            double perMonth = monthly * x.weight() / TOTAL_WEIGHT;
            if ("PRODUCT".equals(x.kind()) && x.active() && perMonth > x.stock()) {
                warnings.add(x.title() + ": ожидается ~" + String.format(Locale.ROOT, "%.1f", perMonth)
                        + " в месяц, на складе " + x.stock());
            }
        }
        return new AutofillDto(dto.tier(), dto.items(), dto.avgPrizeMinor(), dto.avgCostMinor(), dto.marginMinor(),
                dto.targetCostMinor(), warnings);
    }

    private GiftCaseTier tierOf(String code) {
        GiftCaseTier.Tier tier = GiftService.parseTier(code).orElseThrow(() -> new DomainException.NotFound(GiftError.LEVEL_NOT_FOUND));
        return tierRepository.findById(tier).orElseThrow(() -> new DomainException.NotFound(GiftError.LEVEL_NOT_FOUND));
    }

    private Set<String> slugs(List<String> given, String settingKey) {
        Set<String> out = new LinkedHashSet<>();
        List<String> src = given != null ? given : Arrays.asList(settings.getString(settingKey).split(","));
        src.stream().map(s -> s == null ? "" : s.trim().toLowerCase(Locale.ROOT)).filter(s -> !s.isEmpty()).forEach(out::add);
        return out;
    }

    private Map<String, Category> categories() {
        Map<String, Category> out = new HashMap<>();
        categoryRepository.allCategories().forEach(c -> out.put(UuidUtil.toString(c.getId()), c));
        return out;
    }

    private static Category root(String categoryId, Map<String, Category> all) {
        Category c = categoryId == null ? null : all.get(categoryId);
        for (int guard = 0; c != null && c.getParentId() != null && guard < 10; guard++) {
            Category parent = all.get(UuidUtil.toString(c.getParentId()));
            if (parent == null) {
                break;
            }
            c = parent;
        }
        return c;
    }

    private static boolean usable(ProductDto p, boolean newOnly) {
        return p.active() && p.priceMinor() > 0 && p.effectiveStock() > 0 && GiftService.image(p) != null
                && (!newOnly || p.condition() == null || "NEW".equals(p.condition()));
    }

    private static DraftItemDto fromDraft(CaseDraftItem d, Map<String, ProductDto> byId) {
        boolean discount = "DISCOUNT".equalsIgnoreCase(d.kind());
        String rarity = d.rarity() == null ? "COMMON" : d.rarity().trim().toUpperCase(Locale.ROOT);
        try {
            GiftCaseItem.Rarity.valueOf(rarity);
        } catch (IllegalArgumentException e) {
            rarity = "COMMON";
        }
        int weight = d.weight() == null ? 0 : d.weight();
        boolean active = d.active() == null || d.active();
        if (discount) {
            int pc = d.discountPercent() == null ? 0 : d.discountPercent();
            int amount = d.discountUah() == null ? 0 : d.discountUah();
            return new DraftItemDto(d.id(), "DISCOUNT", null, discountTitle(pc, amount), null, 0, 0, true, null,
                    pc, pc > 0 ? 0 : amount, rarity, weight, active);
        }
        String pid = d.productId() == null ? null : d.productId().trim().toLowerCase(Locale.ROOT);
        ProductDto p = pid == null ? null : byId.get(pid);
        return new DraftItemDto(d.id(), "PRODUCT", pid, p == null ? "(товар скрыт или удалён)" : p.title(),
                GiftService.image(p), p == null ? 0 : p.priceMinor(), p == null ? 0 : p.effectiveStock(), p != null,
                null, 0, 0, rarity, weight, active);
    }

}
