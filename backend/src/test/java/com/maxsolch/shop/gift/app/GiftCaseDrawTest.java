package com.maxsolch.shop.gift.app;

import com.maxsolch.shop.gift.domain.GiftCaseItem;
import com.maxsolch.shop.gift.domain.GiftCaseTier;

import org.junit.jupiter.api.Test;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.SplittableRandom;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

class GiftCaseDrawTest {

    private static GiftService.CaseEntry product(long id, String productId, String rarity, int weight) {
        return new GiftService.CaseEntry(id, GiftCaseTier.Tier.SILVER, GiftCaseItem.Kind.PRODUCT, productId, 0, 0,
                rarity, weight);
    }

    private static GiftService.CaseEntry discount(long id, int percent, int uah, int weight) {
        return new GiftService.CaseEntry(id, GiftCaseTier.Tier.SILVER, GiftCaseItem.Kind.DISCOUNT, null, percent, uah,
                "RARE", weight);
    }

    private static final List<GiftService.CaseEntry> CASE = List.of(
            product(1, "common", "COMMON", 70),
            product(2, "rare", "RARE", 25),
            product(3, "gold", "GOLD", 5));

    private static String key(GiftService.CaseEntry c) {
        return c.isDiscount() ? "d" + c.id() : c.productId();
    }

    @Test
    void drawFollowsWeights() {
        var random = new SplittableRandom(42);
        Map<String, Integer> hits = new HashMap<>();
        int n = 100_000;
        for (int i = 0; i < n; i++) {
            hits.merge(key(GiftService.draw(CASE, id -> true, random).orElseThrow()), 1, Integer::sum);
        }
        assertThat(hits.get("common") / (double) n).isCloseTo(0.70, within(0.01));
        assertThat(hits.get("rare") / (double) n).isCloseTo(0.25, within(0.01));
        assertThat(hits.get("gold") / (double) n).isCloseTo(0.05, within(0.005));
    }

    @Test
    void outOfStockPrizesNeverDrop() {
        var random = new SplittableRandom(7);
        Set<String> inStock = Set.of("rare");
        for (int i = 0; i < 1000; i++) {
            assertThat(GiftService.draw(CASE, inStock::contains, random).orElseThrow().productId()).isEqualTo("rare");
        }
    }

    @Test
    void nothingInStockGivesNothing() {
        assertThat(GiftService.draw(CASE, id -> false, new SplittableRandom(1))).isEmpty();
        assertThat(GiftService.draw(List.of(), id -> true, new SplittableRandom(1))).isEmpty();
    }

    @Test
    void discountsDropWithoutStock() {
        List<GiftService.CaseEntry> pool = List.of(product(1, "mouse", "COMMON", 50), discount(2, 10, 0, 50));
        var random = new SplittableRandom(3);
        int discounts = 0;
        for (int i = 0; i < 1000; i++) {
            GiftService.CaseEntry won = GiftService.draw(pool, id -> false, random).orElseThrow();
            assertThat(won.isDiscount()).isTrue();
            discounts++;
        }
        assertThat(discounts).isEqualTo(1000);
    }

    @Test
    void reachedTiersDearestFirst() {
        var bronze = new GiftService.TierConfig(GiftCaseTier.Tier.BRONZE, 150_000, 3, 100, 50, List.of());
        var silver = new GiftService.TierConfig(GiftCaseTier.Tier.SILVER, 300_000, 5, 250, 50, List.of());
        var gold = new GiftService.TierConfig(GiftCaseTier.Tier.GOLD, 600_000, 7, 600, 60, List.of());
        var cfg = new GiftService.GiftConfig(null, 0, List.of(bronze, silver, gold));
        assertThat(cfg.reached(100_000)).isEmpty();
        assertThat(cfg.reached(0)).isEmpty();
        assertThat(cfg.reached(150_000)).extracting(GiftService.TierConfig::tier).containsExactly(GiftCaseTier.Tier.BRONZE);
        assertThat(cfg.reached(450_000)).extracting(GiftService.TierConfig::tier)
                .containsExactly(GiftCaseTier.Tier.SILVER, GiftCaseTier.Tier.BRONZE);
        assertThat(cfg.reached(1_000_000)).extracting(GiftService.TierConfig::tier)
                .containsExactly(GiftCaseTier.Tier.GOLD, GiftCaseTier.Tier.SILVER, GiftCaseTier.Tier.BRONZE);
    }

    @Test
    void guaranteedDiscountIsWholeHryvniasWithinTheCap() {
        // 5 % of 3 499,99 ₴ = 174,99 → 174 ₴
        assertThat(GiftCaseTier.guaranteedDiscountMinor(5, 250, 349_999)).isEqualTo(17_400);
        // capped at 250 ₴
        assertThat(GiftCaseTier.guaranteedDiscountMinor(5, 250, 1_000_000)).isEqualTo(25_000);
        // no cap
        assertThat(GiftCaseTier.guaranteedDiscountMinor(5, 0, 1_000_000)).isEqualTo(50_000);
        // off
        assertThat(GiftCaseTier.guaranteedDiscountMinor(0, 250, 1_000_000)).isZero();
    }

    @Test
    void swapIsAShareOfThePrizePrice() {
        GiftCaseTier t = new GiftCaseTier();
        t.setSwapPercent(50);
        assertThat(t.swapAmountMinor(129_900)).isEqualTo(64_900);
        t.setSwapPercent(0);
        assertThat(t.swapAmountMinor(129_900)).isZero();
    }
}
