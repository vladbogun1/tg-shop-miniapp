package com.maxsolch.shop.bundle;

import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;
import java.util.function.Function;

import static org.assertj.core.api.Assertions.assertThat;

class BundlePricingTest {

    // Categories: Мыши, Коврики › Тканевые, Глайды, Рукава.
    private static final Map<String, List<String>> PATHS = Map.of(
            "mice", List.of("mice"),
            "cloth", List.of("cloth", "mats"),
            "glides", List.of("glides"),
            "sleeves", List.of("sleeves"),
            "keyboards", List.of("keyboards"));
    private static final Function<String, List<String>> PATH = id -> PATHS.getOrDefault(id, List.of());

    private static final List<BundlePricing.Rule> RULES = List.of(
            new BundlePricing.Rule("mice", "glides"),
            new BundlePricing.Rule("mice", "mats"),
            new BundlePricing.Rule("mats", "sleeves"));

    private static final BundlePricing.Config CFG =
            new BundlePricing.Config(true, List.of(5, 10, 15), 50, 0);

    private static BundlePricing.Line line(String key, String cat, long uah, int qty) {
        return new BundlePricing.Line(key, cat, uah * 100, qty);
    }

    @Test
    void oneAddonGetsTierOne() {
        var r = BundlePricing.compute(List.of(
                line("mouse", "mice", 3000, 1),
                line("glides", "glides", 400, 1)), RULES, PATH, CFG);
        assertThat(r.percent()).isEqualTo(5);
        assertThat(r.discountMinor()).isEqualTo(2000); // 5 % of 400 ₴ = 20 ₴
        assertThat(r.lines()).containsOnlyKeys("glides");
    }

    @Test
    void parentCategoryRuleMatchesSubcategoryAndThreeAddonsGetTierThree() {
        // mouse 3000 → mat 1400 (≤ 50 %) and glides; mat → sleeve.
        var r = BundlePricing.compute(List.of(
                line("mouse", "mice", 3000, 1),
                line("mat", "cloth", 1400, 1),
                line("glides", "glides", 150, 1),
                line("sleeve", "sleeves", 270, 1)), RULES, PATH, CFG);
        assertThat(r.addonUnits()).isEqualTo(3);
        assertThat(r.percent()).isEqualTo(15);
        // 15 %: 1400 → 210, 270 → 40 (40.5 rounded down), 150 → 22 (22.5)
        assertThat(r.discountMinor()).isEqualTo((210 + 40 + 22) * 100);
        assertThat(r.lines()).doesNotContainKey("mouse");
    }

    @Test
    void tooExpensiveAccessoryIsNotAnAddon() {
        var r = BundlePricing.compute(List.of(
                line("mouse", "mice", 2000, 1),
                line("mat", "cloth", 1700, 1)), RULES, PATH, CFG);
        assertThat(r).isEqualTo(BundlePricing.Result.EMPTY);
    }

    @Test
    void noAnchorNoDiscount() {
        var r = BundlePricing.compute(List.of(
                line("glides", "glides", 150, 2),
                line("sleeve", "sleeves", 270, 1)), RULES, PATH, CFG);
        assertThat(r.discountMinor()).isZero();
    }

    @Test
    void onlyThreeMostExpensiveUnitsAreDiscounted() {
        var r = BundlePricing.compute(List.of(
                line("mouse", "mice", 3000, 1),
                line("glides", "glides", 400, 5)), RULES, PATH, CFG);
        assertThat(r.addonUnits()).isEqualTo(3);
        assertThat(r.lines().get("glides").units()).isEqualTo(3);
        assertThat(r.discountMinor()).isEqualTo(3 * 60 * 100);
    }

    @Test
    void capLimitsTheTotal() {
        var cfg = new BundlePricing.Config(true, List.of(5, 10, 15), 50, 5000);
        var r = BundlePricing.compute(List.of(
                line("mouse", "mice", 3000, 1),
                line("mat", "cloth", 1400, 1),
                line("glides", "glides", 400, 1)), RULES, PATH, cfg);
        assertThat(r.discountMinor()).isEqualTo(5000);
        assertThat(r.lines().values().stream().mapToLong(BundlePricing.LineDiscount::discountMinor).sum())
                .isEqualTo(5000);
    }

    @Test
    void disabledOrNoRulesGivesNothing() {
        var off = new BundlePricing.Config(false, List.of(5, 10, 15), 50, 0);
        List<BundlePricing.Line> cart = List.of(line("mouse", "mice", 3000, 1), line("g", "glides", 400, 1));
        assertThat(BundlePricing.compute(cart, RULES, PATH, off)).isEqualTo(BundlePricing.Result.EMPTY);
        assertThat(BundlePricing.compute(cart, List.of(), PATH, CFG)).isEqualTo(BundlePricing.Result.EMPTY);
    }

    @Test
    void equalPricesAtHundredPercentMakeOnlyOneAddon() {
        var rules = List.of(new BundlePricing.Rule("mice", "keyboards"), new BundlePricing.Rule("keyboards", "mice"));
        var cfg = new BundlePricing.Config(true, List.of(5, 10, 15), 100, 0);
        var r = BundlePricing.compute(List.of(
                line("mouse", "mice", 2000, 1),
                line("kb", "keyboards", 2000, 1)), rules, PATH, cfg);
        assertThat(r.lines()).containsOnlyKeys("kb");
    }
}
