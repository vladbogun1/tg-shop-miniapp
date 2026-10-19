package com.maxsolch.shop.gift;

import com.maxsolch.shop.common.UuidUtil;
import com.maxsolch.shop.gift.GiftDtos.CaseItemDto;
import com.maxsolch.shop.gift.GiftDtos.GiftInfoDto;
import com.maxsolch.shop.service.CatalogService;
import com.maxsolch.shop.settings.SettingsRegistry;
import com.maxsolch.shop.settings.SettingsService;
import com.maxsolch.shop.web.dto.ProductDto;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.Predicate;
import java.util.random.RandomGenerator;

/**
 * The gift for the order sum (docs/GIFT-CASE.md): one product, or a gift case — a CS-style case
 * whose prize the server draws at checkout ({@code OrderService.createOrder}) among the prizes in
 * stock. Settings — group {@code gift} (gift.*), prizes — table {@code gift_case_items} (V58).
 */
@Service
public class GiftService {

    public static final String KIND_PRODUCT = "PRODUCT";
    public static final String KIND_CASE = "CASE";

    /**
     * Weight of a prize = its chance in millionths of the case (1 = 0.0001 %, 1 000 000 = 100 %).
     * Chances shown to customers are re-normalised over the prizes in stock.
     */
    public static final int CASE_WEIGHT_PER_PERCENT = 10_000;

    private final SettingsService settings;
    private final CatalogService catalogService;
    private final GiftCaseItemRepository caseRepository;

    public GiftService(SettingsService settings, CatalogService catalogService, GiftCaseItemRepository caseRepository) {
        this.settings = settings;
        this.catalogService = catalogService;
        this.caseRepository = caseRepository;
    }

    /**
     * The gift for the order sum, or empty when it is off or has nothing to give: one product
     * ({@code productId}, may be null in case mode) and/or the prizes of the gift case
     * ({@code caseItems}, empty unless gift.caseEnabled). The case wins when one of its prizes is
     * in stock; otherwise the single product is the fallback.
     */
    @Transactional(readOnly = true)
    public Optional<GiftConfig> giftConfig() {
        if (!settings.getBool(SettingsRegistry.GIFT_ENABLED)) {
            return Optional.empty();
        }
        String id = settings.getString(SettingsRegistry.GIFT_PRODUCT_ID);
        String productId = null;
        if (id != null && !id.isBlank()) {
            try {
                UuidUtil.toBytes(id.trim());
                productId = id.trim();
            } catch (IllegalArgumentException e) {
                productId = null;
            }
        }
        List<CaseEntry> caseItems = settings.getBool(SettingsRegistry.GIFT_CASE_ENABLED) ? casePool() : List.of();
        if (productId == null && caseItems.isEmpty()) {
            return Optional.empty();
        }
        return Optional.of(new GiftConfig(productId, settings.getInt(SettingsRegistry.GIFT_THRESHOLD_UAH) * 100L,
                caseItems));
    }

    public record GiftConfig(String productId, long thresholdMinor, List<CaseEntry> caseItems) {

        /** Every product the checkout may give away (locked up front, in id order). */
        public List<String> productIds() {
            List<String> out = new ArrayList<>();
            if (productId != null) {
                out.add(productId);
            }
            caseItems.forEach(c -> out.add(c.productId()));
            return out;
        }
    }

    public record CaseEntry(String productId, String rarity, int weight) {
    }

    /** Active prizes of the case regardless of the gift switches — for an admin giving a case by hand. */
    @Transactional(readOnly = true)
    public List<CaseEntry> casePool() {
        return caseRepository.findAllByOrderBySortOrderAscIdAsc().stream()
                .filter(GiftCaseItem::isActive)
                .filter(c -> c.getWeight() > 0)
                .map(c -> new CaseEntry(UuidUtil.toString(c.getProductId()), c.getRarity().name(), c.getWeight()))
                .toList();
    }

    /** Chance in percent with 4 decimals (0.0001 % resolution). */
    public static double chancePercent(long weight, long total) {
        return total <= 0 ? 0 : Math.round(weight * 1_000_000.0 / total) / 10_000.0;
    }

    /**
     * Weighted draw among the prizes that can be given now ({@code available}: productId → in stock).
     * Empty when none is available.
     */
    public static Optional<CaseEntry> draw(List<CaseEntry> items, Predicate<String> available, RandomGenerator random) {
        List<CaseEntry> pool = items.stream().filter(c -> c.weight() > 0 && available.test(c.productId())).toList();
        long total = pool.stream().mapToLong(CaseEntry::weight).sum();
        if (total <= 0) {
            return Optional.empty();
        }
        long r = random.nextLong(total);
        for (CaseEntry c : pool) {
            r -= c.weight();
            if (r < 0) {
                return Optional.of(c);
            }
        }
        return Optional.of(pool.get(pool.size() - 1));
    }

    // ---- storefront ----

    /** GET /api/public/gift: what the shop gives for the order sum now; empty = off or nothing in stock. */
    @Transactional(readOnly = true)
    public Optional<GiftInfoDto> info(String lang) {
        Optional<GiftConfig> cfg = giftConfig();
        if (cfg.isEmpty()) {
            return Optional.empty();
        }
        Map<String, ProductDto> byId = byId(lang);
        List<CaseItemDto> prizes = casePrizes(cfg.get(), byId);
        if (!prizes.isEmpty()) {
            return Optional.of(new GiftInfoDto(cfg.get().thresholdMinor(), KIND_CASE, null, prizes));
        }
        ProductDto p = cfg.get().productId() == null ? null : byId.get(cfg.get().productId());
        if (p == null || p.effectiveStock() <= 0) {
            return Optional.empty();
        }
        return Optional.of(new GiftInfoDto(cfg.get().thresholdMinor(), KIND_PRODUCT, p, List.of()));
    }

    /** The case prizes in stock with their chances (%), rarest last; empty = no case now. */
    public static List<CaseItemDto> casePrizes(GiftConfig cfg, Map<String, ProductDto> byId) {
        List<CaseEntry> live = cfg.caseItems().stream()
                .filter(c -> {
                    ProductDto p = byId.get(c.productId());
                    return p != null && p.effectiveStock() > 0;
                })
                .toList();
        long total = live.stream().mapToLong(CaseEntry::weight).sum();
        if (total <= 0) {
            return List.of();
        }
        return live.stream()
                .map(c -> {
                    ProductDto p = byId.get(c.productId());
                    return new CaseItemDto(p.id(), p.title(), image(p), p.priceMinor(), c.rarity(),
                            chancePercent(c.weight(), total));
                })
                .sorted(Comparator.comparingInt((CaseItemDto d) -> GiftCaseItem.Rarity.valueOf(d.rarity()).ordinal())
                        .thenComparing(CaseItemDto::priceMinor))
                .toList();
    }

    /** Case prizes for the customer's language (the reel of the opening screen). */
    @Transactional(readOnly = true)
    public List<CaseItemDto> casePrizes(String lang) {
        Optional<GiftConfig> cfg = giftConfig();
        return cfg.isEmpty() ? List.of() : casePrizes(cfg.get(), byId(lang));
    }

    static String image(ProductDto p) {
        return p == null || p.images() == null || p.images().isEmpty() ? null : p.images().get(0).url();
    }

    private Map<String, ProductDto> byId(String lang) {
        Map<String, ProductDto> byId = new HashMap<>();
        catalogService.listActiveProducts(lang).forEach(p -> byId.put(p.id(), p));
        return byId;
    }
}
