package com.maxsolch.shop.bundle;

import com.maxsolch.shop.bundle.BundleDtos.SlotDto;
import com.maxsolch.shop.catalog.CatalogDtos.BrandRefDto;
import com.maxsolch.shop.web.dto.ProductDto;
import com.maxsolch.shop.web.dto.TagDto;
import org.junit.jupiter.api.Test;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;

import static org.assertj.core.api.Assertions.assertThat;

class BundleRankerTest {

    // Мыши; Коврики › Тканевые; Глайды; Кейкапы; Клавиатуры.
    private static final Map<String, List<String>> PATHS = Map.of(
            "mice", List.of("mice"),
            "cloth", List.of("cloth", "mats"),
            "mats", List.of("mats"),
            "glides", List.of("glides"),
            "keycaps", List.of("keycaps"),
            "keyboards", List.of("keyboards"));
    private static final Function<String, List<String>> PATH = id -> PATHS.getOrDefault(id, List.of());

    private static ProductDto p(String id, String title, String cat, long uah, int stock, long sold, String brand,
                                Map<String, Object> specs) {
        return new ProductDto(id, title, null, uah * 100, "UAH", stock, true, sold, List.of(), List.of(),
                List.of(new TagDto(cat, cat + "-name", cat, 0, true)), id, null, null, null, null, brand, null,
                null, 0, cat, brand == null ? null : new BrandRefDto("b-" + brand, brand, brand), "NEW", null,
                specs);
    }

    private static BundleRanker.Context ctx(BundlePairStats pairs, int explore, int roll) {
        BundleMargins m = new BundleMargins(Map.of(), id -> null, 15, 5, true);
        return new BundleRanker.Context(PATH, pairs, m, m::cap, m::cap, null, true, explore, () -> roll);
    }

    private static BundleRanker.Request req(ProductDto anchor, List<String> targets, int maxSlots) {
        return new BundleRanker.Request(anchor, targets, Set.of(anchor.id()), Set.of(PATH.apply(anchor.categoryId())
                .get(PATH.apply(anchor.categoryId()).size() - 1)), true, 50, maxSlots);
    }

    @Test
    void colorMatchWinsAndOtherColorsBecomeSwatches() {
        ProductDto mouse = p("m", "Pulsar X2 Pink", "mice", 3000, 5, 10, "Pulsar", Map.of("color", List.of("pink")));
        List<ProductDto> all = List.of(mouse,
                p("mat-b", "Artisan Zero Black", "cloth", 1200, 5, 20, "Artisan", Map.of("color", List.of("black"))),
                p("mat-p", "Artisan Zero Pink", "cloth", 1200, 5, 5, "Artisan", Map.of("color", List.of("pink"))),
                p("mat-o", "Other Mat", "cloth", 600, 5, 8, "Other", Map.of("color", List.of("black"))));
        List<SlotDto> slots = BundleRanker.slots(req(mouse, List.of("mats"), 3), all, ctx(BundlePairStats.EMPTY, 0, 99));
        assertThat(slots).hasSize(1);
        SlotDto s = slots.get(0);
        assertThat(s.primary().product().id()).isEqualTo("mat-p");
        assertThat(s.primary().reasons()).contains(BundleRanker.REASON_COLOR);
        assertThat(s.colors()).extracting(i -> i.product().id()).containsExactly("mat-b");
        assertThat(s.alternatives()).extracting(i -> i.product().id()).containsExactly("mat-o");
        assertThat(s.primary().capPercent()).isEqualTo(10);
        assertThat(s.primary().score()).isNotNull();
    }

    @Test
    void filtersStockPriceAndStem() {
        ProductDto kb = p("kb", "Board", "keyboards", 4000, 5, 1, null, Map.of("stem", "mx"));
        List<ProductDto> all = List.of(kb,
                p("k-mx", "Caps MX", "keycaps", 900, 5, 1, null, Map.of("stem", List.of("mx"))),
                p("k-alps", "Caps Alps", "keycaps", 900, 5, 50, null, Map.of("stem", List.of("alps"))),
                p("k-out", "Caps Out", "keycaps", 900, 0, 90, null, Map.of()),
                p("k-dear", "Caps Dear", "keycaps", 2500, 5, 90, null, Map.of()));
        List<SlotDto> slots = BundleRanker.slots(req(kb, List.of("keycaps"), 3), all, ctx(BundlePairStats.EMPTY, 0, 99));
        assertThat(slots).hasSize(1);
        assertThat(slots.get(0).primary().product().id()).isEqualTo("k-mx");
        assertThat(slots.get(0).alternatives()).isEmpty();
    }

    @Test
    void slotsAreOrderedByPairStrengthAndLimited() {
        ProductDto mouse = p("m", "Mouse", "mice", 3000, 5, 10, null, Map.of());
        List<ProductDto> all = List.of(mouse,
                p("g", "Glides", "glides", 300, 5, 3, null, Map.of()),
                p("mat", "Mat", "cloth", 900, 5, 3, null, Map.of()));
        Map<String, Map<String, Integer>> together = new HashMap<>();
        together.put("mice", Map.of("mats", 30, "glides", 2));
        BundlePairStats pairs = new BundlePairStats(200, Map.of("mice", 100), together);
        List<SlotDto> slots = BundleRanker.slots(req(mouse, List.of("glides", "mats"), 1), all, ctx(pairs, 0, 99));
        assertThat(slots).extracting(SlotDto::categoryId).containsExactly("mats");
        assertThat(slots.get(0).pairPercent()).isEqualTo(30);
    }

    @Test
    void exploreSwapsInTheSecondModel() {
        ProductDto mouse = p("m", "Mouse", "mice", 3000, 5, 10, null, Map.of());
        List<ProductDto> all = List.of(mouse,
                p("a", "Alpha Mat", "cloth", 900, 5, 40, null, Map.of()),
                p("b", "Beta Mat", "cloth", 900, 5, 1, null, Map.of()));
        SlotDto normal = BundleRanker.slots(req(mouse, List.of("mats"), 3), all, ctx(BundlePairStats.EMPTY, 10, 50)).get(0);
        SlotDto explored = BundleRanker.slots(req(mouse, List.of("mats"), 3), all, ctx(BundlePairStats.EMPTY, 10, 5)).get(0);
        assertThat(normal.primary().product().id()).isEqualTo("a");
        assertThat(normal.explore()).isFalse();
        assertThat(explored.primary().product().id()).isEqualTo("b");
        assertThat(explored.explore()).isTrue();
    }

    @Test
    void familyDropsColourWordsInThreeLanguages() {
        ProductDto a = p("1", "Килимок Artisan Zero чорний", "cloth", 1, 1, 0, "Artisan", Map.of());
        ProductDto b = p("2", "Килимок Artisan Zero рожевий", "cloth", 1, 1, 0, "Artisan", Map.of());
        ProductDto c = p("3", "Artisan Zero XL", "cloth", 1, 1, 0, "Artisan", Map.of());
        assertThat(BundleRanker.family(a)).isEqualTo(BundleRanker.family(b));
        assertThat(BundleRanker.family(a)).isNotEqualTo(BundleRanker.family(c));
    }

    @Test
    void marginsInheritAndClamp() {
        Map<String, BundleMargins.Row> rows = Map.of(
                "mats", new BundleMargins.Row(40, null, 12),
                "cloth", new BundleMargins.Row(null, 50, null),
                "glides", new BundleMargins.Row(4, null, null));
        BundleMargins m = new BundleMargins(rows, id -> "cloth".equals(id) ? "mats" : null, 15, 5, true);
        assertThat(m.margin("cloth")).isEqualTo(40);
        assertThat(m.cap("cloth")).isEqualTo(35);           // manual 50 clamped to 40 − 5
        assertThat(m.capSource("cloth")).isEqualTo(BundleMargins.SOURCE_MANUAL);
        assertThat(m.cap("mats")).isEqualTo(12);            // auto
        assertThat(m.cap("glides")).isZero();               // margin 4 < safety
        assertThat(m.cap("mice")).isEqualTo(10);            // average 15 − 5
        BundleMargins noAuto = new BundleMargins(rows, id -> null, 15, 5, false);
        assertThat(noAuto.cap("mats")).isEqualTo(35);
    }

    @Test
    void autoTuneFormula() {
        // m = 40, r = 10 %, e = 4 %/п.п. → 20 − 1.1 / 0.08 = 6.25
        assertThat(BundleInsightsService.optimal(40, 0.10, 0.04)).isEqualTo(6.25);
        assertThat(BundleInsightsService.optimal(15, 0.10, 0.04)).isNegative();
    }
}
