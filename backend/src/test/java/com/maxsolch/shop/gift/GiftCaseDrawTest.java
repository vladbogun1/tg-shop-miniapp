package com.maxsolch.shop.gift;

import org.junit.jupiter.api.Test;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.SplittableRandom;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

class GiftCaseDrawTest {

    private static final List<GiftService.CaseEntry> CASE = List.of(
            new GiftService.CaseEntry("common", "COMMON", 70),
            new GiftService.CaseEntry("rare", "RARE", 25),
            new GiftService.CaseEntry("gold", "GOLD", 5));

    @Test
    void drawFollowsWeights() {
        var random = new SplittableRandom(42);
        Map<String, Integer> hits = new HashMap<>();
        int n = 100_000;
        for (int i = 0; i < n; i++) {
            hits.merge(GiftService.draw(CASE, id -> true, random).orElseThrow().productId(), 1, Integer::sum);
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
}
