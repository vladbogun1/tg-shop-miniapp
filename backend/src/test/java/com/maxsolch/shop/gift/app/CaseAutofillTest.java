package com.maxsolch.shop.gift.app;

import com.maxsolch.shop.gift.domain.GiftCaseItem;
import com.maxsolch.shop.gift.domain.GiftCaseTier;

import com.maxsolch.shop.gift.app.GiftDtos.AutofillDto;
import com.maxsolch.shop.gift.app.GiftDtos.DraftItemDto;
import com.maxsolch.shop.catalog.app.ProductDto;
import com.maxsolch.shop.catalog.app.ProductImageDto;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.EnumSet;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/** «Автособрать» of the case builder (docs/GIFT-CASE.md). */
class CaseAutofillTest {

    /** 3000 ₴ — the silver threshold of the demo. */
    private static final long T = 300_000;

    private static final List<CaseAutofill.Candidate> CATALOG = catalog();

    @Test
    void fillsTheSlotsAndHitsTheTargetCost() {
        AutofillDto res = CaseAutofill.build(input(GiftCaseTier.Tier.SILVER, 50, 8, 2, false, CATALOG, List.of()));

        assertThat(res.items()).hasSize(8);
        assertThat(sum(res)).isEqualTo(CaseAutofill.TOTAL_WEIGHT);
        assertThat(res.items()).noneMatch(x -> "GOLD".equals(x.rarity()));
        assertThat(res.items()).filteredOn(x -> "DISCOUNT".equals(x.kind())).hasSize(2);
        assertThat(res.items().stream().filter(x -> x.productId() != null).map(DraftItemDto::productId).distinct())
                .hasSize(6);
        assertThat(res.targetCostMinor()).isEqualTo(Math.round(T * 0.15 * 0.5));
        assertThat((double) res.avgCostMinor()).isCloseTo(res.targetCostMinor(), within(res.targetCostMinor() * 0.03));
        assertThat(res.warnings()).isEmpty();
        // Products sit in their price bands.
        for (DraftItemDto x : res.items()) {
            if ("PRODUCT".equals(x.kind())) {
                double[] band = CaseAutofill.BANDS.get(GiftCaseItem.Rarity.valueOf(x.rarity()));
                assertThat(x.priceMinor()).isBetween(Math.round(T * band[0]), Math.round(T * band[1]));
            }
        }
    }

    @Test
    void jackpotOnlyInGoldFromTheSuperCategories() {
        ProductDto keyboard = product(1_200_000, 3);
        List<CaseAutofill.Candidate> superPool = List.of(new CaseAutofill.Candidate(keyboard, "klaviatury", "Клавиатуры"),
                new CaseAutofill.Candidate(product(400_000, 2), "myshki", "Мыши"));
        AutofillDto gold = CaseAutofill.build(input(GiftCaseTier.Tier.GOLD, 60, 10, 2, true, CATALOG, superPool));
        List<DraftItemDto> jackpots = gold.items().stream().filter(x -> "GOLD".equals(x.rarity())).toList();
        assertThat(jackpots).hasSize(1);
        assertThat(jackpots.get(0).productId()).isEqualTo(keyboard.id());
        assertThat(jackpots.get(0).weight()).isBetween(CaseAutofill.MIN_GOLD_WEIGHT,
                (int) (CaseAutofill.CAP_GOLD * GiftService.CASE_WEIGHT_PER_PERCENT) + 1);
        assertThat(sum(gold)).isEqualTo(CaseAutofill.TOTAL_WEIGHT);

        // No jackpot asked — no GOLD prize even with a super pool.
        AutofillDto none = CaseAutofill.build(input(GiftCaseTier.Tier.GOLD, 60, 10, 2, false, CATALOG, superPool));
        assertThat(none.items()).noneMatch(x -> "GOLD".equals(x.rarity()));
    }

    @Test
    void aShortBandTurnsIntoDiscountsWithAWarning() {
        // Only cheap products: nothing for RARE / EPIC / LEGENDARY.
        List<CaseAutofill.Candidate> cheap = new ArrayList<>();
        for (int i = 0; i < 10; i++) {
            cheap.add(new CaseAutofill.Candidate(product(15_000 + i * 1000, 5), "kovriki", "Коврики"));
        }
        AutofillDto res = CaseAutofill.build(input(GiftCaseTier.Tier.SILVER, 50, 8, 0, false, cheap, List.of()));
        assertThat(res.items()).filteredOn(x -> "RARE".equals(x.rarity())).allMatch(x -> "DISCOUNT".equals(x.kind()));
        assertThat(res.warnings()).anyMatch(w -> w.contains("заменено скидками"));
        assertThat(res.warnings()).anyMatch(w -> w.contains("слот пропущен"));
        assertThat(sum(res)).isEqualTo(CaseAutofill.TOTAL_WEIGHT);
    }

    @Test
    void lockedPrizesStay() {
        DraftItemDto locked = new DraftItemDto(7L, "PRODUCT", UUID.randomUUID().toString(), "Мой приз", "x", 60_000, 4,
                true, null, 0, 0, "RARE", 0, true);
        CaseAutofill.Input in = new CaseAutofill.Input(GiftCaseTier.Tier.SILVER, T, 15, 50, 8, 2, false, CATALOG,
                List.of(), List.of(locked), 42, 0);
        AutofillDto res = CaseAutofill.build(in);
        assertThat(res.items()).hasSize(8);
        assertThat(res.items()).anyMatch(x -> Long.valueOf(7L).equals(x.id()) && "RARE".equals(x.rarity()) && x.weight() > 0);
    }

    @Test
    void sharesKeepTheCaps() {
        Map<GiftCaseItem.Rarity, Double> s = CaseAutofill.shares(EnumSet.allOf(GiftCaseItem.Rarity.class), 5);
        assertThat(s.get(GiftCaseItem.Rarity.GOLD)).isLessThanOrEqualTo(CaseAutofill.CAP_GOLD + 1e-9);
        assertThat(s.get(GiftCaseItem.Rarity.LEGENDARY)).isLessThanOrEqualTo(CaseAutofill.CAP_LEGENDARY + 1e-9);
        assertThat(s.get(GiftCaseItem.Rarity.COMMON)).isGreaterThanOrEqualTo(CaseAutofill.MIN_COMMON - 1e-9);
        assertThat(s.values().stream().mapToDouble(Double::doubleValue).sum()).isCloseTo(100, within(1e-6));
    }

    @Test
    void sameSeedSameCase() {
        AutofillDto a = CaseAutofill.build(input(GiftCaseTier.Tier.SILVER, 50, 8, 2, false, CATALOG, List.of()));
        AutofillDto b = CaseAutofill.build(input(GiftCaseTier.Tier.SILVER, 50, 8, 2, false, CATALOG, List.of()));
        assertThat(a.items()).extracting(DraftItemDto::productId)
                .isEqualTo(b.items().stream().map(DraftItemDto::productId).toList());
    }

    private static CaseAutofill.Input input(GiftCaseTier.Tier tier, int costShare, int prizes, int discounts,
                                            boolean jackpot, List<CaseAutofill.Candidate> pool,
                                            List<CaseAutofill.Candidate> superPool) {
        return new CaseAutofill.Input(tier, T, 15, costShare, prizes, discounts, jackpot, pool, superPool, List.of(), 42, 0);
    }

    /** Consumables across every band of a 3000 ₴ threshold. */
    private static List<CaseAutofill.Candidate> catalog() {
        List<CaseAutofill.Candidate> out = new ArrayList<>();
        long[] prices = {12_000, 18_000, 25_000, 30_000, 34_000, 40_000, 55_000, 70_000, 80_000, 99_000,
                120_000, 150_000, 170_000, 200_000, 260_000, 330_000};
        String[] cats = {"kovriki", "glaydy", "keykapy", "rukava", "kabelya"};
        for (int i = 0; i < prices.length; i++) {
            out.add(new CaseAutofill.Candidate(product(prices[i], 3 + i % 5), cats[i % cats.length], cats[i % cats.length]));
        }
        return out;
    }

    private static ProductDto product(long price, int stock) {
        ProductDto p = mock(ProductDto.class);
        when(p.id()).thenReturn(UUID.randomUUID().toString());
        when(p.title()).thenReturn("Товар " + price / 100);
        when(p.priceMinor()).thenReturn(price);
        when(p.effectiveStock()).thenReturn(stock);
        when(p.soldCount()).thenReturn(price % 7);
        when(p.active()).thenReturn(true);
        when(p.images()).thenReturn(List.of(new ProductImageDto(1L, "https://x/" + price + ".jpg", 0)));
        return p;
    }

    private static long sum(AutofillDto res) {
        return res.items().stream().filter(DraftItemDto::active).mapToLong(DraftItemDto::weight).sum();
    }
}
