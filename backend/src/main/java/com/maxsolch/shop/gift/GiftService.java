package com.maxsolch.shop.gift;

import com.maxsolch.shop.common.UuidUtil;
import com.maxsolch.shop.domain.PromoCode;
import com.maxsolch.shop.gift.GiftDtos.CaseItemDto;
import com.maxsolch.shop.gift.GiftDtos.GiftInfoDto;
import com.maxsolch.shop.gift.GiftDtos.TierInfoDto;
import com.maxsolch.shop.repository.PromoCodeRepository;
import com.maxsolch.shop.service.CatalogService;
import com.maxsolch.shop.settings.SettingsRegistry;
import com.maxsolch.shop.settings.SettingsService;
import com.maxsolch.shop.web.dto.ProductDto;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.EnumMap;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.function.Predicate;
import java.util.random.RandomGenerator;

/**
 * The gift for the order sum (docs/GIFT-CASE.md): one product, or a gift case of one of three tiers
 * (bronze / silver / gold, {@code gift_case_tiers}) whose prize — a product or a discount — the
 * server draws at checkout ({@code OrderService.createOrder}). Settings — group {@code gift}
 * (gift.*), prizes — table {@code gift_case_items} (V57).
 */
@Service
public class GiftService {

    public static final String KIND_PRODUCT = "PRODUCT";
    public static final String KIND_CASE = "CASE";

    /** Customer's choice at checkout when the tier offers a guaranteed discount. */
    public static final String CHOICE_CASE = "CASE";
    public static final String CHOICE_DISCOUNT = "DISCOUNT";

    /** Promo codes issued by the case (a discount prize, a swap): «Персональные» in the admin. */
    public static final String PROMO_SOURCE = "GIFT_CASE";

    /**
     * Weight of a prize = its chance in millionths of the tier (1 = 0.0001 %, 1 000 000 = 100 %).
     * Real chances are re-normalised over the tier's prizes that can drop now; only the admin sees them.
     */
    public static final int CASE_WEIGHT_PER_PERCENT = 10_000;

    private static final SecureRandom CODE_RANDOM = new SecureRandom();
    private static final char[] CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789".toCharArray();

    private final SettingsService settings;
    private final CatalogService catalogService;
    private final GiftCaseItemRepository caseRepository;
    private final GiftCaseTierRepository tierRepository;
    private final OrderGiftCaseRepository orderCaseRepository;
    private final PromoCodeRepository promoCodes;

    public GiftService(SettingsService settings, CatalogService catalogService, GiftCaseItemRepository caseRepository,
                       GiftCaseTierRepository tierRepository, OrderGiftCaseRepository orderCaseRepository,
                       PromoCodeRepository promoCodes) {
        this.settings = settings;
        this.catalogService = catalogService;
        this.caseRepository = caseRepository;
        this.tierRepository = tierRepository;
        this.orderCaseRepository = orderCaseRepository;
        this.promoCodes = promoCodes;
    }

    /**
     * The gift for the order sum, or empty when it is off or has nothing to give: one product
     * ({@code productId}, may be null in case mode) and/or the case tiers that have prizes
     * ({@code tiers}, empty unless gift.caseEnabled). A case wins when the order reaches a tier with a
     * prize that can drop; otherwise the single product is the fallback.
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
        List<TierConfig> tiers = settings.getBool(SettingsRegistry.GIFT_CASE_ENABLED) ? tiers(false) : List.of();
        if (productId == null && tiers.isEmpty()) {
            return Optional.empty();
        }
        return Optional.of(new GiftConfig(productId, settings.getInt(SettingsRegistry.GIFT_THRESHOLD_UAH) * 100L,
                tiers));
    }

    /**
     * @param productId      the single gift product (null = none / case only)
     * @param thresholdMinor threshold of the single product
     * @param tiers          enabled case tiers with at least one active prize, cheapest first
     */
    public record GiftConfig(String productId, long thresholdMinor, List<TierConfig> tiers) {

        /** Every product the checkout may give away (locked up front, in id order). */
        public List<String> productIds() {
            List<String> out = new ArrayList<>();
            if (productId != null) {
                out.add(productId);
            }
            tiers.forEach(t -> t.prizes().stream().filter(c -> c.productId() != null)
                    .forEach(c -> out.add(c.productId())));
            return out;
        }

        /** Tiers an order total reaches, dearest first (the order falls back to a cheaper one when a pool is empty). */
        public List<TierConfig> reached(long totalMinor) {
            if (totalMinor <= 0) {
                return List.of();
            }
            return tiers.stream().filter(t -> totalMinor >= t.thresholdMinor())
                    .sorted(Comparator.comparingLong(TierConfig::thresholdMinor).reversed()
                            .thenComparing(t -> -t.tier().ordinal()))
                    .toList();
        }
    }

    public record TierConfig(GiftCaseTier.Tier tier, long thresholdMinor, int guaranteedPercent, int guaranteedMaxUah,
                             int swapPercent, List<CaseEntry> prizes) {

        public long guaranteedDiscountMinor(long totalMinor) {
            return GiftCaseTier.guaranteedDiscountMinor(guaranteedPercent, guaranteedMaxUah, totalMinor);
        }
    }

    /** A prize as the draw sees it; {@code productId} null for a discount. */
    public record CaseEntry(long id, GiftCaseTier.Tier tier, GiftCaseItem.Kind kind, String productId,
                            int discountPercent, int discountUah, String rarity, int weight) {

        public boolean isDiscount() {
            return kind == GiftCaseItem.Kind.DISCOUNT;
        }
    }

    /**
     * Enabled tiers (or all of them, for an admin giving a case by hand) with their active prizes,
     * cheapest first; a tier without a prize is left out.
     */
    @Transactional(readOnly = true)
    public List<TierConfig> tiers(boolean includeDisabled) {
        Map<GiftCaseTier.Tier, List<CaseEntry>> byTier = new EnumMap<>(GiftCaseTier.Tier.class);
        caseRepository.findAllByOrderBySortOrderAscIdAsc().stream()
                .filter(GiftCaseItem::isActive)
                .filter(c -> c.getWeight() > 0)
                .filter(c -> c.isDiscount() ? c.getDiscountPercent() > 0 || c.getDiscountUah() > 0 : c.getProductId() != null)
                .forEach(c -> byTier.computeIfAbsent(c.getTier(), k -> new ArrayList<>()).add(entry(c)));
        return tierRepository.findAll().stream()
                .filter(t -> includeDisabled || t.isEnabled())
                .filter(t -> byTier.containsKey(t.getTier()))
                .sorted(Comparator.comparingInt(GiftCaseTier::getThresholdUah).thenComparing(GiftCaseTier::getTier))
                .map(t -> new TierConfig(t.getTier(), t.thresholdMinor(), t.getGuaranteedPercent(),
                        t.getGuaranteedMaxUah(), t.getSwapPercent(), List.copyOf(byTier.get(t.getTier()))))
                .toList();
    }

    /** One tier with its prizes, regardless of the switches (admin «Выдать кейс»); empty = no prizes. */
    @Transactional(readOnly = true)
    public Optional<TierConfig> tier(GiftCaseTier.Tier tier) {
        return tiers(true).stream().filter(t -> t.tier() == tier).findFirst();
    }

    @Transactional(readOnly = true)
    public Optional<GiftCaseTier> tierSettings(String tier) {
        return parseTier(tier).flatMap(tierRepository::findById);
    }

    private static CaseEntry entry(GiftCaseItem c) {
        return new CaseEntry(c.getId(), c.getTier(), c.getKind(),
                c.getProductId() == null ? null : UuidUtil.toString(c.getProductId()),
                c.getDiscountPercent(), c.getDiscountUah(), c.getRarity().name(), c.getWeight());
    }

    public static Optional<GiftCaseTier.Tier> parseTier(String value) {
        if (value == null || value.isBlank()) {
            return Optional.empty();
        }
        try {
            return Optional.of(GiftCaseTier.Tier.valueOf(value.trim().toUpperCase(Locale.ROOT)));
        } catch (IllegalArgumentException e) {
            return Optional.empty();
        }
    }

    /** Chance in percent with 4 decimals (0.0001 % resolution). */
    public static double chancePercent(long weight, long total) {
        return total <= 0 ? 0 : Math.round(weight * 1_000_000.0 / total) / 10_000.0;
    }

    /**
     * Weighted draw among the prizes that can drop now: discounts always, products when
     * {@code available} (productId → in stock). Empty when none can.
     */
    public static Optional<CaseEntry> draw(List<CaseEntry> items, Predicate<String> available, RandomGenerator random) {
        List<CaseEntry> pool = items.stream()
                .filter(c -> c.weight() > 0 && (c.isDiscount() || available.test(c.productId())))
                .toList();
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

    // ---- the order's prize ----

    @Transactional(readOnly = true)
    public Optional<OrderGiftCase> orderCase(byte[] orderId) {
        return orderCaseRepository.findById(orderId);
    }

    @Transactional
    public OrderGiftCase saveOrderCase(OrderGiftCase c) {
        return orderCaseRepository.save(c);
    }

    @Transactional
    public void deleteOrderCase(byte[] orderId) {
        orderCaseRepository.findById(orderId).ifPresent(orderCaseRepository::delete);
    }

    /** The prize record of a draw (saved by the caller once the order has its id). */
    public static OrderGiftCase record(byte[] orderId, CaseEntry prize, String title) {
        OrderGiftCase c = new OrderGiftCase();
        c.setOrderId(orderId);
        c.setTier(prize.tier().name());
        c.setCaseItemId(prize.id());
        c.setKind(prize.kind().name());
        c.setRarity(prize.rarity());
        c.setProductId(prize.productId() == null ? null : UuidUtil.toBytes(prize.productId()));
        c.setTitle(title);
        if (prize.isDiscount()) {
            c.setDiscountPercent(prize.discountPercent() > 0 ? Math.min(100, prize.discountPercent()) : 0);
            c.setDiscountAmountMinor(prize.discountPercent() > 0 ? 0 : prize.discountUah() * 100L);
        }
        return c;
    }

    /**
     * A personal single-use code on the next order: the discount prize (issued on opening) or the
     * swap of a prize. Valid gift.promoValidDays.
     */
    @Transactional
    public PromoCode issuePromo(Long ownerUserId, byte[] orderId, int percent, long amountMinor) {
        PromoCode promo = new PromoCode();
        promo.setCode(uniqueCode());
        promo.setDiscountPercent(percent > 0 ? Math.min(100, percent) : 0);
        promo.setDiscountAmountMinor(percent > 0 ? 0 : Math.max(0, amountMinor));
        promo.setMaxUses(1);
        promo.setUsesCount(0);
        promo.setActive(true);
        promo.setOwnerUserId(ownerUserId);
        int days = Math.max(1, settings.getInt(SettingsRegistry.GIFT_PROMO_VALID_DAYS));
        promo.setExpiresAt(Instant.now().plus(Duration.ofDays(days)));
        promo.setSource(PROMO_SOURCE);
        promo.setSourceOrderId(orderId);
        return promoCodes.save(promo);
    }

    @Transactional(readOnly = true)
    public Optional<PromoCode> promo(String code) {
        return code == null ? Optional.empty() : promoCodes.findByCode(code);
    }

    /**
     * The order was rejected: an unused code its case gave (a discount prize, a swap) is switched off,
     * or a customer could pay, open, cancel and keep the discount.
     */
    @Transactional
    public void revokeCasePromo(byte[] orderId) {
        orderCaseRepository.findById(orderId).map(OrderGiftCase::getPromoCode)
                .flatMap(promoCodes::findByCode)
                .filter(p -> p.getUsesCount() == 0 && p.isActive())
                .ifPresent(p -> {
                    p.setActive(false);
                    promoCodes.save(p);
                });
    }

    private String uniqueCode() {
        for (int attempt = 0; attempt < 20; attempt++) {
            StringBuilder sb = new StringBuilder("CASE");
            for (int i = 0; i < 6; i++) {
                sb.append(CODE_ALPHABET[CODE_RANDOM.nextInt(CODE_ALPHABET.length)]);
            }
            String code = sb.toString();
            if (promoCodes.findByCode(code).isEmpty()) {
                return code;
            }
        }
        throw new IllegalStateException("could not generate a unique case code");
    }

    // ---- storefront ----

    /** GET /api/public/gift: what the shop gives for the order sum now; empty = off or nothing to give. */
    @Transactional(readOnly = true)
    public Optional<GiftInfoDto> info(String lang) {
        Optional<GiftConfig> cfg = giftConfig();
        if (cfg.isEmpty()) {
            return Optional.empty();
        }
        Map<String, ProductDto> byId = byId(lang);
        List<TierInfoDto> tiers = new ArrayList<>();
        for (TierConfig t : cfg.get().tiers()) {
            List<CaseItemDto> prizes = casePrizes(t, byId);
            if (!prizes.isEmpty()) {
                tiers.add(new TierInfoDto(t.tier().name(), t.thresholdMinor(), t.guaranteedPercent(),
                        t.guaranteedMaxUah() * 100L, t.swapPercent() > 0, prizes));
            }
        }
        if (!tiers.isEmpty()) {
            return Optional.of(new GiftInfoDto(tiers.get(0).thresholdMinor(), KIND_CASE, null, tiers));
        }
        ProductDto p = cfg.get().productId() == null ? null : byId.get(cfg.get().productId());
        if (p == null || p.effectiveStock() <= 0) {
            return Optional.empty();
        }
        return Optional.of(new GiftInfoDto(cfg.get().thresholdMinor(), KIND_PRODUCT, p, List.of()));
    }

    /**
     * The tier's prizes that can drop now (discounts, products in stock), most common rarity first.
     * No chances: customers never see them.
     */
    public static List<CaseItemDto> casePrizes(TierConfig tier, Map<String, ProductDto> byId) {
        return tier.prizes().stream()
                .filter(c -> c.isDiscount() || inStock(byId.get(c.productId())))
                .map(c -> itemDto(c, c.isDiscount() ? null : byId.get(c.productId())))
                .sorted(Comparator.comparingInt((CaseItemDto d) -> GiftCaseItem.Rarity.valueOf(d.rarity()).ordinal())
                        .thenComparing(CaseItemDto::priceMinor))
                .toList();
    }

    /** Prizes of one tier for the customer's language (the reel of the opening screen). */
    @Transactional(readOnly = true)
    public List<CaseItemDto> casePrizes(String tier, String lang) {
        return parseTier(tier).flatMap(this::tier)
                .map(t -> casePrizes(t, byId(lang)))
                .orElse(List.of());
    }

    public static CaseItemDto itemDto(CaseEntry c, ProductDto p) {
        if (c.isDiscount()) {
            int pc = c.discountPercent() > 0 ? Math.min(100, c.discountPercent()) : 0;
            return new CaseItemDto("d" + c.id(), GiftCaseItem.Kind.DISCOUNT.name(), null, null, null, 0,
                    c.rarity(), pc, pc > 0 ? 0 : c.discountUah() * 100L);
        }
        return new CaseItemDto("p" + c.productId(), GiftCaseItem.Kind.PRODUCT.name(), c.productId(),
                p == null ? null : p.title(), image(p), p == null ? 0 : p.priceMinor(), c.rarity(), 0, 0);
    }

    static boolean inStock(ProductDto p) {
        return p != null && p.effectiveStock() > 0;
    }

    static String image(ProductDto p) {
        return p == null || p.images() == null || p.images().isEmpty() ? null : p.images().get(0).url();
    }

    Map<String, ProductDto> byId(String lang) {
        Map<String, ProductDto> byId = new HashMap<>();
        catalogService.listActiveProducts(lang).forEach(p -> byId.put(p.id(), p));
        return byId;
    }
}
