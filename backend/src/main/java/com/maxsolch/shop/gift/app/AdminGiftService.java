package com.maxsolch.shop.gift.app;

import com.maxsolch.shop.promo.app.PromoSettings;
import static com.maxsolch.shop.gift.app.CasePrizeRules.caseDto;
import static com.maxsolch.shop.gift.app.CasePrizeRules.discountLabel;
import static com.maxsolch.shop.gift.app.CasePrizeRules.kind;
import static com.maxsolch.shop.gift.app.CasePrizeRules.live;
import static com.maxsolch.shop.gift.app.CasePrizeRules.rarity;
import static com.maxsolch.shop.gift.app.CasePrizeRules.setDiscount;
import static com.maxsolch.shop.gift.app.CasePrizeRules.weight;

import com.maxsolch.shop.gift.domain.GiftError;
import com.maxsolch.shop.promo.app.CaseLowMargin;

import com.maxsolch.shop.gift.domain.GiftCaseItem;
import com.maxsolch.shop.gift.domain.GiftCaseTier;
import com.maxsolch.shop.gift.infra.GiftCaseItemRepository;
import com.maxsolch.shop.gift.infra.GiftCaseTierRepository;

import com.maxsolch.shop.audit.app.AdminAuditService;
import com.maxsolch.shop.platform.util.UuidUtil;
import com.maxsolch.shop.gift.app.GiftDtos.CaseDraftItem;
import com.maxsolch.shop.gift.app.GiftDtos.CaseItemAdminDto;
import com.maxsolch.shop.gift.app.GiftDtos.CaseItemRequest;
import com.maxsolch.shop.gift.app.GiftDtos.GiftStatsDto;
import com.maxsolch.shop.gift.app.GiftDtos.TierAdminDto;
import com.maxsolch.shop.gift.app.GiftDtos.TierRequest;
import com.maxsolch.shop.gift.app.GiftDtos.TierStatsDto;
import com.maxsolch.shop.catalog.app.CatalogService;
import com.maxsolch.shop.settings.app.SettingsService;
import com.maxsolch.shop.gift.domain.GiftTally;
import com.maxsolch.shop.gift.infra.GiftQueries;
import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.catalog.app.ProductDto;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.EnumMap;
import java.util.Arrays;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/** The gift cases in the admin: tiers, prizes with chances, the numbers (docs/GIFT-CASE.md). */
@Service
public class AdminGiftService {

    /** The admin reads the Russian source texts. */
    private static final String ADMIN_LANG = "ru";

    private final GiftCaseItemRepository caseRepository;
    private final GiftCaseTierRepository tierRepository;
    private final CatalogService catalogService;
    private final AdminAuditService audit;
    private final GiftQueries queries;
    private final Clock clock;
    private final SettingsService settings;
    private final CaseLowMargin lowMargin;

    public AdminGiftService(GiftCaseItemRepository caseRepository, GiftCaseTierRepository tierRepository,
                            CatalogService catalogService, AdminAuditService audit, GiftQueries queries,
                            SettingsService settings, CaseLowMargin lowMargin, Clock clock) {
        this.settings = settings;
        this.lowMargin = lowMargin;
        this.caseRepository = caseRepository;
        this.tierRepository = tierRepository;
        this.catalogService = catalogService;
        this.audit = audit;
        this.queries = queries;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public GiftStatsDto stats() {
        Instant since = clock.instant().minus(Duration.ofDays(30));
        List<TierStatsDto> tiers = new ArrayList<>(queries.tierTallies(since).stream()
                .map(t -> new TierStatsDto(t.tier(), t.cases(), t.opened(), t.guaranteed())).toList());
        tiers.sort(Comparator.comparingInt(t -> GiftService.parseTier(t.tier()).map(Enum::ordinal).orElse(9)));
        GiftTally all = queries.tally(since);
        return new GiftStatsDto(since, all.orders(), all.giftOrders(), all.caseOrders(), all.casesOpened(),
                all.guaranteedOrders(), all.guaranteedMinor(), all.swaps(), all.discountPrizes(), List.copyOf(tiers));
    }

    // ---- tiers ----

    @Transactional(readOnly = true)
    public List<TierAdminDto> tiers() {
        List<CaseItemAdminDto> items = caseItems();
        int margin = settings.getInt(GiftSettings.GIFT_MARGIN_PERCENT);
        Map<GiftCaseTier.Tier, Double> monthly = monthlyOrders();
        return tierRepository.findAll().stream()
                .sorted(Comparator.comparing(GiftCaseTier::getTier))
                .map(t -> {
                    List<CaseItemAdminDto> mine = items.stream().filter(i -> i.tier().equals(t.getTier().name())).toList();
                    List<CaseItemAdminDto> live = mine.stream().filter(i -> i.chancePercent() > 0).toList();
                    // The average product prize as the server draws (discounts are not money spent now).
                    long avg = Math.round(live.stream().filter(i -> "PRODUCT".equals(i.kind()))
                            .mapToDouble(i -> i.chancePercent() / 100 * i.priceMinor()).sum());
                    return new TierAdminDto(t.getTier().name(), t.isEnabled(), t.getThresholdUah(),
                            t.getGuaranteedPercent(), t.getGuaranteedMaxUah(), t.getSwapPercent(), t.getPromoValidDays(), mine.size(),
                            live.size(), avg, margin, monthly.getOrDefault(t.getTier(), 0.0),
                            t.getLowMarginProductPercent());
                })
                .toList();
    }

    /**
     * Orders a month (last 90 days, not rejected) whose total falls between a tier's threshold and the
     * next dearer one: how many cases of the tier to expect if every such order takes the case.
     */
    Map<GiftCaseTier.Tier, Double> monthlyOrders() {
        List<GiftCaseTier> sorted = tierRepository.findAll().stream()
                .sorted(Comparator.comparingInt(GiftCaseTier::getThresholdUah)).toList();
        Map<GiftCaseTier.Tier, Double> out = new EnumMap<>(GiftCaseTier.Tier.class);
        Instant since = clock.instant().minus(Duration.ofDays(90));
        for (int i = 0; i < sorted.size(); i++) {
            long from = sorted.get(i).thresholdMinor();
            long to = i + 1 < sorted.size() ? sorted.get(i + 1).thresholdMinor() : Long.MAX_VALUE;
            long n = queries.countOrdersByTotal(since, from, to);
            out.put(sorted.get(i).getTier(), Math.round(n / 3.0 * 10) / 10.0);
        }
        return out;
    }

    @Transactional
    public TierAdminDto updateTier(String code, TierRequest body) {
        GiftCaseTier.Tier tier = GiftService.parseTier(code).orElseThrow(() -> new DomainException.NotFound(GiftError.LEVEL_NOT_FOUND));
        GiftCaseTier t = tierRepository.findById(tier).orElseThrow(() -> new DomainException.NotFound(GiftError.LEVEL_NOT_FOUND));
        if (body != null) {
            if (body.enabled() != null) {
                t.setEnabled(body.enabled());
            }
            if (body.thresholdUah() != null) {
                t.setThresholdUah(range(body.thresholdUah(), 1, 1_000_000, GiftError.THRESHOLD_RANGE));
            }
            if (body.guaranteedPercent() != null) {
                t.setGuaranteedPercent(range(body.guaranteedPercent(), 0, 50, GiftError.GUARANTEED_PERCENT_RANGE));
            }
            if (body.guaranteedMaxUah() != null) {
                t.setGuaranteedMaxUah(range(body.guaranteedMaxUah(), 0, 100_000, GiftError.GUARANTEED_MAX_RANGE));
            }
            if (body.swapPercent() != null) {
                t.setSwapPercent(range(body.swapPercent(), 0, 100, GiftError.SWAP_PERCENT_RANGE));
            }
            if (body.promoValidDays() != null) {
                t.setPromoValidDays(range(body.promoValidDays(), 1, 365, GiftError.PROMO_DAYS_RANGE));
            }
            if (body.lowMarginProductPercent() != null) {
                t.setLowMarginProductPercent(range(body.lowMarginProductPercent(), 0, 100, GiftError.LOW_MARGIN_PERCENT_RANGE));
            }
        }
        tierRepository.save(t);
        audit.record("GIFT_CASE_TIER_UPDATE", "GIFT_CASE_TIER", tier.name(),
                (t.isEnabled() ? "вкл" : "выкл") + " · от " + t.getThresholdUah() + " ₴ · гарантия "
                        + t.getGuaranteedPercent() + " % (до " + t.getGuaranteedMaxUah() + " ₴) · замена "
                        + t.getSwapPercent() + " % · промокод " + t.getPromoValidDays() + " дн. · с упором на скидки "
                        + t.getLowMarginProductPercent() + " % товаров");
        return tiers().stream().filter(d -> d.tier().equals(tier.name())).findFirst().orElseThrow();
    }

    // ---- low-margin products ----

    /** Brands and products whose orders get the case leaning to discounts. */
    @Transactional(readOnly = true)
    public GiftDtos.LowMarginDto lowMargin() {
        Map<String, ProductDto> byId = new HashMap<>();
        catalogService.listActiveProducts(ADMIN_LANG).forEach(p -> byId.put(p.id(), p));
        List<GiftDtos.LowMarginBrandDto> brands = lowMargin.brands().stream()
                .map(b -> new GiftDtos.LowMarginBrandDto(b.getSlug(), b.getName(), byId.values().stream()
                        .filter(p -> p.brandRef() != null && b.getSlug().equals(p.brandRef().slug())).count()))
                .toList();
        List<GiftDtos.LowMarginProductDto> products = lowMargin.productIdsMarked().stream()
                .map(id -> {
                    ProductDto p = byId.get(id);
                    return new GiftDtos.LowMarginProductDto(id, p == null ? "(товар скрыт или удалён)" : p.title(),
                            GiftService.image(p), p == null ? 0 : p.priceMinor());
                })
                .toList();
        return new GiftDtos.LowMarginDto(brands, products,
                (int) lowMargin.productIds().stream().filter(byId::containsKey).count());
    }

    /** Replaces both lists (settings gift.lowMarginBrands / gift.lowMarginProducts). */
    @Transactional
    public GiftDtos.LowMarginDto updateLowMargin(GiftDtos.LowMarginRequest body) {
        Map<String, Object> changes = new HashMap<>();
        if (body != null && body.brands() != null) {
            changes.put(PromoSettings.GIFT_LOW_MARGIN_BRANDS, String.join(",", clean(body.brands())));
        }
        if (body != null && body.products() != null) {
            List<String> ids = clean(body.products());
            ids.forEach(id -> {
                try {
                    UuidUtil.toBytes(id);
                } catch (IllegalArgumentException e) {
                    throw new DomainException.BadRequest(GiftError.INVALID_PRODUCT_ID, String.valueOf(id));
                }
            });
            changes.put(PromoSettings.GIFT_LOW_MARGIN_PRODUCTS, String.join(",", ids));
        }
        if (!changes.isEmpty()) {
            settings.update(changes);
        }
        return lowMargin();
    }

    private static List<String> clean(List<String> values) {
        return values.stream().filter(java.util.Objects::nonNull)
                .map(s -> s.trim().toLowerCase(java.util.Locale.ROOT)).filter(s -> !s.isEmpty()).distinct().toList();
    }

    // ---- prizes ----

    @Transactional(readOnly = true)
    public List<CaseItemAdminDto> caseItems() {
        List<GiftCaseItem> items = caseRepository.findAllByOrderBySortOrderAscIdAsc();
        Map<String, ProductDto> byId = new HashMap<>();
        catalogService.listActiveProducts(ADMIN_LANG).forEach(p -> byId.put(p.id(), p));
        // Chances as the checkout draws them, per tier: active prizes that can drop (discounts, products in stock).
        Map<GiftCaseTier.Tier, Long> totals = new EnumMap<>(GiftCaseTier.Tier.class);
        for (GiftCaseItem i : items) {
            if (live(i, byId)) {
                totals.merge(i.getTier(), (long) i.getWeight(), Long::sum);
            }
        }
        List<CaseItemAdminDto> out = new ArrayList<>();
        for (GiftCaseItem i : items) {
            out.add(caseDto(i, i.getProductId() == null ? null : byId.get(UuidUtil.toString(i.getProductId())),
                    totals.getOrDefault(i.getTier(), 0L), live(i, byId)));
        }
        return out;
    }

    @Transactional
    public CaseItemAdminDto addCaseItem(CaseItemRequest body) {
        if (body == null) {
            throw new DomainException.BadRequest(GiftError.EMPTY_REQUEST);
        }
        GiftCaseTier.Tier tier = GiftService.parseTier(body.tier())
                .orElseThrow(() -> new DomainException.BadRequest(GiftError.CASE_TIER_REQUIRED));
        GiftCaseItem.Kind kind = kind(body.kind());
        GiftCaseItem item = new GiftCaseItem();
        item.setTier(tier);
        item.setKind(kind);
        String label;
        if (kind == GiftCaseItem.Kind.PRODUCT) {
            if (body.productId() == null || body.productId().isBlank()) {
                throw new DomainException.BadRequest(GiftError.PRIZE_PRODUCT_REQUIRED);
            }
            byte[] pid;
            try {
                pid = UuidUtil.toBytes(body.productId().trim());
            } catch (IllegalArgumentException e) {
                throw new DomainException.BadRequest(GiftError.INVALID_PRODUCT);
            }
            ProductDto p = catalogService.getProduct(body.productId().trim(), ADMIN_LANG)
                    .orElseThrow(() -> new DomainException.BadRequest(GiftError.PRODUCT_NOT_FOUND_OR_HIDDEN));
            if (caseRepository.existsByTierAndProductId(tier, pid)) {
                throw new DomainException.BadRequest(GiftError.PRODUCT_ALREADY_IN_CASE, p.title());
            }
            item.setProductId(pid);
            label = p.title();
        } else {
            setDiscount(item, body.discountPercent(), body.discountUah());
            label = discountLabel(item);
        }
        item.setRarity(rarity(body.rarity(), GiftCaseItem.Rarity.COMMON));
        item.setWeight(weight(body.weight(), 10 * GiftService.CASE_WEIGHT_PER_PERCENT));
        item.setSortOrder(body.sortOrder() != null ? body.sortOrder()
                : caseRepository.findAll().stream().mapToInt(GiftCaseItem::getSortOrder).max().orElse(0) + 10);
        item.setActive(body.active() == null || body.active());
        GiftCaseItem saved = caseRepository.save(item);
        audit.record("GIFT_CASE_ITEM_CREATE", "GIFT_CASE_ITEM", String.valueOf(saved.getId()),
                tier + " · " + label + " · " + saved.getRarity() + " · вес " + saved.getWeight());
        return caseItems().stream().filter(d -> d.id() == saved.getId()).findFirst().orElseThrow();
    }

    @Transactional
    public CaseItemAdminDto updateCaseItem(long id, CaseItemRequest body) {
        GiftCaseItem item = caseRepository.findById(id).orElseThrow(() -> new DomainException.NotFound(GiftError.PRIZE_NOT_FOUND));
        if (body != null) {
            if (body.rarity() != null) {
                item.setRarity(rarity(body.rarity(), item.getRarity()));
            }
            if (body.weight() != null) {
                item.setWeight(weight(body.weight(), item.getWeight()));
            }
            if (body.sortOrder() != null) {
                item.setSortOrder(body.sortOrder());
            }
            if (body.active() != null) {
                item.setActive(body.active());
            }
            if (item.isDiscount() && (body.discountPercent() != null || body.discountUah() != null)) {
                setDiscount(item,
                        body.discountPercent() != null ? body.discountPercent() : (body.discountUah() != null ? 0 : item.getDiscountPercent()),
                        body.discountUah() != null ? body.discountUah() : (body.discountPercent() != null ? 0 : item.getDiscountUah()));
            }
        }
        caseRepository.save(item);
        audit.record("GIFT_CASE_ITEM_UPDATE", "GIFT_CASE_ITEM", String.valueOf(id),
                item.getTier() + " · " + (item.isDiscount() ? discountLabel(item) + " · " : "") + item.getRarity()
                        + " · вес " + item.getWeight() + (item.isActive() ? "" : " (выключен)"));
        return caseItems().stream().filter(d -> d.id() == id).findFirst().orElseThrow();
    }

    /**
     * «Опубликовать» the case builder's draft: the tier's prizes become exactly {@code draft}, in one
     * transaction, so customers never draw from a half-edited case. A row with a known {@code id} of this
     * tier keeps its id (a product prize only while it is the same product); the rest are created; prizes
     * missing from the draft are removed. One audit entry for the whole publish.
     */
    @Transactional
    public List<CaseItemAdminDto> replaceItems(String code, List<CaseDraftItem> draft) {
        GiftCaseTier.Tier tier = GiftService.parseTier(code).orElseThrow(() -> new DomainException.NotFound(GiftError.LEVEL_NOT_FOUND));
        List<CaseDraftItem> items = draft == null ? List.of() : draft;
        if (items.size() > 40) {
            throw new DomainException.BadRequest(GiftError.TOO_MANY_PRIZES);
        }
        Map<Long, GiftCaseItem> existing = new HashMap<>();
        caseRepository.findAllByOrderBySortOrderAscIdAsc().stream()
                .filter(i -> i.getTier() == tier).forEach(i -> existing.put(i.getId(), i));
        Set<String> products = new HashSet<>();
        List<GiftCaseItem> out = new ArrayList<>();
        for (int k = 0; k < items.size(); k++) {
            CaseDraftItem d = items.get(k);
            GiftCaseItem.Kind kind = kind(d.kind());
            byte[] pid = null;
            if (kind == GiftCaseItem.Kind.PRODUCT) {
                String id = d.productId() == null ? "" : d.productId().trim().toLowerCase(Locale.ROOT);
                try {
                    pid = UuidUtil.toBytes(id);
                } catch (IllegalArgumentException e) {
                    throw new DomainException.BadRequest(GiftError.INVALID_PRIZE_PRODUCT, String.valueOf((k + 1)));
                }
                if (!products.add(id)) {
                    throw new DomainException.BadRequest(GiftError.DUPLICATE_PRIZE_PRODUCT);
                }
                if (catalogService.getProduct(id, ADMIN_LANG).isEmpty()) {
                    throw new DomainException.BadRequest(GiftError.PRIZE_PRODUCT_NOT_FOUND, String.valueOf((k + 1)));
                }
            }
            GiftCaseItem row = d.id() == null ? null : existing.get(d.id());
            if (row != null && (row.getKind() != kind || (pid != null && !Arrays.equals(pid, row.getProductId())))) {
                row = null; // another prize under an old id: a new row
            }
            if (row == null) {
                row = new GiftCaseItem();
                row.setTier(tier);
                row.setKind(kind);
                row.setProductId(pid);
            } else {
                existing.remove(row.getId());
            }
            if (kind == GiftCaseItem.Kind.DISCOUNT) {
                setDiscount(row, d.discountPercent(), d.discountUah());
            }
            row.setRarity(rarity(d.rarity(), GiftCaseItem.Rarity.COMMON));
            row.setWeight(weight(d.weight(), 10 * GiftService.CASE_WEIGHT_PER_PERCENT));
            row.setSortOrder((k + 1) * 10);
            row.setActive(d.active() == null || d.active());
            out.add(row);
        }
        // Removed first: a product moved to a new row must not hit the (tier, product) key of its old one.
        caseRepository.deleteAll(existing.values());
        caseRepository.flush();
        caseRepository.saveAll(out);
        long total = out.stream().filter(GiftCaseItem::isActive).mapToLong(GiftCaseItem::getWeight).sum();
        audit.record("GIFT_CASE_ITEMS_REPLACE", "GIFT_CASE_TIER", tier.name(),
                out.size() + " призов (скидок " + out.stream().filter(GiftCaseItem::isDiscount).count() + "), убрано "
                        + existing.size() + ", сумма шансов " + String.format(Locale.ROOT, "%.2f",
                        total / (double) GiftService.CASE_WEIGHT_PER_PERCENT) + " %");
        return caseItems();
    }

    @Transactional
    public void deleteCaseItem(long id) {
        GiftCaseItem item = caseRepository.findById(id).orElseThrow(() -> new DomainException.NotFound(GiftError.PRIZE_NOT_FOUND));
        caseRepository.delete(item);
        audit.record("GIFT_CASE_ITEM_DELETE", "GIFT_CASE_ITEM", String.valueOf(id),
                item.getTier() + " · " + (item.isDiscount() ? discountLabel(item) : UuidUtil.toString(item.getProductId())));
    }

    private static int range(int v, int min, int max, GiftError error) {
        if (v < min || v > max) {
            throw new DomainException.BadRequest(error);
        }
        return v;
    }
}
