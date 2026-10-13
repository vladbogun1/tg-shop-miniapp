package com.maxsolch.shop.bundle;

import org.junit.jupiter.api.Test;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.SplittableRandom;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

class GiftCaseDrawTest {

    private static final List<BundleService.CaseEntry> CASE = List.of(
            new BundleService.CaseEntry("common", "COMMON", 70),
            new BundleService.CaseEntry("rare", "RARE", 25),
            new BundleService.CaseEntry("gold", "GOLD", 5));

    @Test
    void drawFollowsWeights() {
        var random = new SplittableRandom(42);
        Map<String, Integer> hits = new HashMap<>();
        int n = 100_000;
        for (int i = 0; i < n; i++) {
            hits.merge(BundleService.draw(CASE, id -> true, random).orElseThrow().productId(), 1, Integer::sum);
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
            assertThat(BundleService.draw(CASE, inStock::contains, random).orElseThrow().productId()).isEqualTo("rare");
        }
    }

    @Test
    void nothingInStockGivesNothing() {
        assertThat(BundleService.draw(CASE, id -> false, new SplittableRandom(1))).isEmpty();
        assertThat(BundleService.draw(List.of(), id -> true, new SplittableRandom(1))).isEmpty();
    }
}
