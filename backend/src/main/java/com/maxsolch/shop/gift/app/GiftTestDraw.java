package com.maxsolch.shop.gift.app;

import com.maxsolch.shop.gift.domain.GiftError;
import com.maxsolch.shop.catalog.app.ProductDto;
import com.maxsolch.shop.gift.app.GiftDtos.CaseDraftItem;
import com.maxsolch.shop.gift.app.GiftDtos.TestDrawDto;
import com.maxsolch.shop.gift.app.GiftDtos.TestHitDto;
import com.maxsolch.shop.gift.app.GiftService.CaseEntry;
import com.maxsolch.shop.gift.app.GiftService.TierConfig;
import com.maxsolch.shop.gift.domain.GiftCaseItem;
import com.maxsolch.shop.gift.domain.GiftCaseTier;
import com.maxsolch.shop.gift.infra.GiftCaseTierRepository;
import com.maxsolch.shop.order.app.OrderGiftDtos.CaseItemDto;
import com.maxsolch.shop.platform.error.DomainException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.random.RandomGenerator;

/** «Тест кейса» in the admin: the checkout's draw run many times on the saved prizes or on a draft, changing nothing. */
@Service
public class GiftTestDraw {

    /** Upper bound of one test run. */
    public static final int TEST_MAX_COUNT = 10_000;
    /** How many draws of a run come back one by one (the strip of ×10). */
    public static final int TEST_DROPS_SHOWN = 20;

    private static final SecureRandom TEST_RANDOM = new SecureRandom();

    /**
     * «Тест кейса»: {@code count} draws of the tier exactly as the checkout draws them (the same pool —
     * active prizes with weight &gt; 0, a product only in stock — and {@link GiftService#draw}), read-only: no order,
     * promo code, stock reserve or journal entry. A disabled tier may be tested too.
     */
    @Transactional(readOnly = true)
    public TestDrawDto testDraw(String tierCode, int count) {
        return testDraw(tierCode, count, null, false, TEST_RANDOM);
    }

    TestDrawDto testDraw(String tierCode, int count, RandomGenerator random) {
        return testDraw(tierCode, count, null, false, random);
    }

    /**
     * «Тест кейса» of the case builder's unpublished draft ({@code draft} non-null) instead of the saved
     * prizes. A draft prize without an id gets {@code -(index + 1)} as its id in the hits.
     */
    @Transactional(readOnly = true)
    public TestDrawDto testDraw(String tierCode, int count, List<CaseDraftItem> draft) {
        return testDraw(tierCode, count, draft, false, TEST_RANDOM);
    }

    /**
     * @param lowMargin draw as for an order with a low-margin product: product prizes get the tier's
     *                  {@code lowMarginProductPercent} of the chance ({@link GiftService#skewedWeights})
     */
    @Transactional(readOnly = true)
    public TestDrawDto testDraw(String tierCode, int count, List<CaseDraftItem> draft, boolean lowMargin) {
        return testDraw(tierCode, count, draft, lowMargin, TEST_RANDOM);
    }

    TestDrawDto testDraw(String tierCode, int count, List<CaseDraftItem> draft, RandomGenerator random) {
        return testDraw(tierCode, count, draft, false, random);
    }

    TestDrawDto testDraw(String tierCode, int count, List<CaseDraftItem> draft, boolean lowMargin,
                         RandomGenerator random) {
        GiftCaseTier.Tier tier = GiftService.parseTier(tierCode)
                .orElseThrow(() -> new DomainException.BadRequest(GiftError.UNKNOWN_CASE_NAMED, tierCode));
        if (count < 1 || count > TEST_MAX_COUNT) {
            throw new DomainException.BadRequest(GiftError.OPENINGS_OUT_OF_RANGE, String.valueOf(TEST_MAX_COUNT));
        }
        Map<String, ProductDto> byId = giftService.byId("ru");
        TierConfig cfg = draft == null ? giftService.tier(tier).orElse(null) : draftConfig(tier, draft);
        List<CaseEntry> pool = cfg == null ? List.of()
                : cfg.prizes().stream().filter(c -> c.isDiscount() || GiftService.inStock(byId.get(c.productId()))).toList();
        if (pool.isEmpty()) {
            throw new DomainException.BadRequest(GiftError.NO_DROPPABLE_PRIZE);
        }
        int productPercent = cfg.productPercent(lowMargin);
        long[] weights = GiftService.skewedWeights(pool, productPercent);
        Map<Long, Long> chanceWeight = new HashMap<>();
        for (int i = 0; i < pool.size(); i++) {
            chanceWeight.put(pool.get(i).id(), weights[i]);
        }
        long total = Arrays.stream(weights).sum();
        Map<Long, Integer> hits = new HashMap<>();
        List<CaseItemDto> drops = new ArrayList<>();
        for (int i = 0; i < count; i++) {
            CaseEntry c = GiftService.draw(pool, id -> true, random, productPercent).orElseThrow();
            hits.merge(c.id(), 1, Integer::sum);
            if (drops.size() < TEST_DROPS_SHOWN) {
                drops.add(GiftService.itemDto(c, c.isDiscount() ? null : byId.get(c.productId())));
            }
        }
        List<TestHitDto> out = pool.stream()
                .map(c -> new TestHitDto(c.id(), c.isDiscount() ? "d" + c.id() : "p" + c.productId(),
                        hits.getOrDefault(c.id(), 0), GiftService.chancePercent(chanceWeight.get(c.id()), total)))
                .toList();
        return new TestDrawDto(tier.name(), count, drops.get(0), drops, GiftService.casePrizes(cfg, byId), out);
    }

    private TierConfig draftConfig(GiftCaseTier.Tier tier, List<CaseDraftItem> draft) {
        GiftCaseTier t = tierRepository.findById(tier).orElseThrow(() -> new DomainException.BadRequest(GiftError.UNKNOWN_CASE));
        List<CaseEntry> prizes = new ArrayList<>();
        for (int i = 0; i < draft.size(); i++) {
            CaseDraftItem d = draft.get(i);
            boolean discount = "DISCOUNT".equalsIgnoreCase(d.kind());
            int pc = d.discountPercent() == null ? 0 : Math.max(0, Math.min(50, d.discountPercent()));
            int uah = d.discountUah() == null ? 0 : Math.max(0, d.discountUah());
            int weight = d.weight() == null ? 0 : Math.max(0, d.weight());
            if (Boolean.FALSE.equals(d.active()) || weight <= 0 || (discount ? pc == 0 && uah == 0 : d.productId() == null)) {
                continue;
            }
            prizes.add(new CaseEntry(d.id() != null ? d.id() : -(i + 1L), tier,
                    discount ? GiftCaseItem.Kind.DISCOUNT : GiftCaseItem.Kind.PRODUCT,
                    discount ? null : d.productId().trim().toLowerCase(Locale.ROOT), pc, pc > 0 ? 0 : uah,
                    parseRarity(d.rarity()), weight));
        }
        return new TierConfig(tier, t.thresholdMinor(), t.getGuaranteedPercent(), t.getGuaranteedMaxUah(),
                t.getSwapPercent(), List.copyOf(prizes), t.getLowMarginProductPercent());
    }

    private static String parseRarity(String value) {
        try {
            return GiftCaseItem.Rarity.valueOf(value == null ? "" : value.trim().toUpperCase(Locale.ROOT)).name();
        } catch (IllegalArgumentException e) {
            return GiftCaseItem.Rarity.COMMON.name();
        }
    }

    private final GiftService giftService;
    private final GiftCaseTierRepository tierRepository;

    public GiftTestDraw(GiftService giftService, GiftCaseTierRepository tierRepository) {
        this.giftService = giftService;
        this.tierRepository = tierRepository;
    }
}
