package com.maxsolch.shop.gift.app;

import com.maxsolch.shop.promo.app.CaseLowMargin;

import com.maxsolch.shop.gift.domain.GiftCaseItem;
import com.maxsolch.shop.gift.domain.GiftCaseTier;
import com.maxsolch.shop.gift.domain.OrderGiftCase;
import com.maxsolch.shop.gift.infra.GiftCaseItemRepository;
import com.maxsolch.shop.gift.infra.GiftCaseTierRepository;
import com.maxsolch.shop.gift.infra.OrderGiftCaseRepository;

import com.maxsolch.shop.platform.util.UuidUtil;
import com.maxsolch.shop.promo.domain.PromoCode;
import com.maxsolch.shop.order.app.OrderGiftDtos.CaseItemDto;
import com.maxsolch.shop.gift.app.GiftDtos.GiftInfoDto;
import com.maxsolch.shop.gift.app.GiftDtos.TestDrawDto;
import com.maxsolch.shop.gift.app.GiftDtos.TestHitDto;
import com.maxsolch.shop.gift.app.GiftDtos.TierInfoDto;
import com.maxsolch.shop.promo.app.PromoCodes;
import com.maxsolch.shop.catalog.app.CatalogService;
import com.maxsolch.shop.platform.settings.SettingsRegistry;
import com.maxsolch.shop.platform.settings.SettingsService;
import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.catalog.app.ProductDto;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
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
 * server draws at checkout ({@code Checkout.createOrder}). Settings — group {@code gift}
 * (gift.*), prizes — table {@code gift_case_items} (V57).
 */
@Service
public class GiftService {

    public static final String KIND_PRODUCT = "PRODUCT";
    public static final String KIND_CASE = "CASE";

    /** Customer's choice at checkout when the tier offers a guaranteed discount. */
    public static final String CHOICE_CASE = "CASE";
    public static final String CHOICE_DISCOUNT = "DISCOUNT";
    /** No gift at all: the replacement order of an exchange (V69). */
    public static final String CHOICE_NONE = "NONE";

    /** Promo codes issued by the case (a discount prize, a swap): «Персональные» in the admin. */

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
    private final PromoCodes promoCodes;
    private final Clock clock;

    public GiftService(SettingsService settings, CatalogService catalogService, GiftCaseItemRepository caseRepository,
                       GiftCaseTierRepository tierRepository, OrderGiftCaseRepository orderCaseRepository,
                       PromoCodes promoCodes, Clock clock) {
        this.settings = settings;
        this.catalogService = catalogService;
        this.caseRepository = caseRepository;
        this.tierRepository = tierRepository;
        this.orderCaseRepository = orderCaseRepository;
        this.promoCodes = promoCodes;
        this.clock = clock;
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

    /**
     * @param lowMarginProductPercent share of all product prizes together in an order with a low-margin
     *                                product ({@link CaseLowMargin}), %; 100 = the usual odds
     */
    public record TierConfig(GiftCaseTier.Tier tier, long thresholdMinor, int guaranteedPercent, int guaranteedMaxUah,
                             int swapPercent, List<CaseEntry> prizes, int lowMarginProductPercent) {

        public TierConfig(GiftCaseTier.Tier tier, long thresholdMinor, int guaranteedPercent, int guaranteedMaxUah,
                          int swapPercent, List<CaseEntry> prizes) {
            this(tier, thresholdMinor, guaranteedPercent, guaranteedMaxUah, swapPercent, prizes, 100);
        }

        /** Product prizes' share for this order: the low-margin one, or 100 (as usual). */
        public int productPercent(boolean lowMargin) {
            return lowMargin ? lowMarginProductPercent : 100;
        }

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
                        t.getGuaranteedMaxUah(), t.getSwapPercent(), List.copyOf(byTier.get(t.getTier())),
                        t.getLowMarginProductPercent()))
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
        return draw(items, available, random, 100);
    }

    /**
     * The same draw with product prizes' share set to {@code productPercent} % (an order with a
     * low-margin product, {@link #skewedWeights}); 100 = the usual odds.
     */
    public static Optional<CaseEntry> draw(List<CaseEntry> items, Predicate<String> available, RandomGenerator random,
                                           int productPercent) {
        List<CaseEntry> pool = items.stream()
                .filter(c -> c.weight() > 0 && (c.isDiscount() || available.test(c.productId())))
                .toList();
        long[] weights = skewedWeights(pool, productPercent);
        long total = Arrays.stream(weights).sum();
        if (total <= 0) {
            return Optional.empty();
        }
        long r = random.nextLong(total);
        for (int i = 0; i < pool.size(); i++) {
            r -= weights[i];
            if (r < 0) {
                return Optional.of(pool.get(i));
            }
        }
        return Optional.of(pool.get(pool.size() - 1));
    }

    /**
     * Weights of a pool that can drop now, with all product prizes together making {@code productPercent} %
     * of the total and discount prizes the rest; the ratios inside each group stay (the jackpot is still
     * the rarest product). Unchanged when the share is 100 or the pool has only products or only
     * discounts — there is nothing to move the chance to.
     */
    static long[] skewedWeights(List<CaseEntry> pool, int productPercent) {
        long[] w = pool.stream().mapToLong(CaseEntry::weight).toArray();
        int pct = Math.max(0, Math.min(100, productPercent));
        long products = pool.stream().filter(c -> !c.isDiscount()).mapToLong(CaseEntry::weight).sum();
        long discounts = pool.stream().filter(CaseEntry::isDiscount).mapToLong(CaseEntry::weight).sum();
        if (pct >= 100 || products <= 0 || discounts <= 0) {
            return w;
        }
        // products : discounts = pct : (100 − pct), exact in integers (weights ≤ 10⁶, a tier ≤ ~10⁸).
        for (int i = 0; i < w.length; i++) {
            w[i] = pool.get(i).isDiscount() ? w[i] * (100 - pct) * products : w[i] * pct * discounts;
        }
        return w;
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
     * swap of a prize. Valid the case tier's {@code promo_valid_days} (30 when the tier is unknown).
     */
    @Transactional
    public PromoCode issuePromo(Long ownerUserId, byte[] orderId, String tier, int percent, long amountMinor) {
        PromoCode promo = new PromoCode();
        promo.setCode(uniqueCode());
        promo.setDiscountPercent(percent > 0 ? Math.min(100, percent) : 0);
        promo.setDiscountAmountMinor(percent > 0 ? 0 : Math.max(0, amountMinor));
        promo.setMaxUses(1);
        promo.setUsesCount(0);
        promo.setActive(true);
        promo.setOwnerUserId(ownerUserId);
        int days = Math.max(1, tierSettings(tier).map(GiftCaseTier::getPromoValidDays).orElse(30));
        promo.setExpiresAt(clock.instant().plus(Duration.ofDays(days)));
        promo.setSource(PromoCode.SOURCE_GIFT_CASE);
        promo.setSourceOrderId(orderId);
        return promoCodes.save(promo);
    }

    @Transactional(readOnly = true)
    public Optional<PromoCode> promo(String code) {
        return code == null ? Optional.empty() : promoCodes.find(code);
    }

    /**
     * The order was rejected: an unused code its case gave (a discount prize, a swap) is switched off,
     * or a customer could pay, open, cancel and keep the discount.
     */
    @Transactional
    public void revokeCasePromo(byte[] orderId) {
        orderCaseRepository.findById(orderId).map(OrderGiftCase::getPromoCode)
                .flatMap(promoCodes::find)
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
            if (promoCodes.find(code).isEmpty()) {
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
                int promoDays = Math.max(1, tierSettings(t.tier().name()).map(GiftCaseTier::getPromoValidDays).orElse(30));
                tiers.add(new TierInfoDto(t.tier().name(), t.thresholdMinor(), t.guaranteedPercent(),
                        t.guaranteedMaxUah() * 100L, t.swapPercent() > 0, t.swapPercent(), promoDays, prizes));
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
