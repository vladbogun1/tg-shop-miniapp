package com.maxsolch.shop.catalog;

import org.junit.jupiter.api.Test;

import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static com.maxsolch.shop.catalog.CatalogFixtures.MAGNETIC;
import static com.maxsolch.shop.catalog.CatalogFixtures.MICE;
import static org.assertj.core.api.Assertions.assertThat;

/** Every type, aliases, errors: a bad field is dropped with an issue, the rest is kept. */
class SpecsValidatorTest {

    private final CatalogSnapshot s = CatalogFixtures.snapshot();

    private SpecsValidator.Result mice(Map<String, Object> raw) {
        return SpecsValidator.validate(s.attributesFor(MICE), raw);
    }

    private static List<String> reasons(SpecsValidator.Result r) {
        return r.issues().stream().map(i -> i.key() + ":" + i.reason()).toList();
    }

    @Test
    void validValuesOfEveryTypeAreKeptAndNormalised() {
        Map<String, Object> raw = new LinkedHashMap<>();
        raw.put("weight_g", "51,0");
        raw.put("dpi", Map.of("min", 50, "max", 30000));
        raw.put("sensor", "PAW3950");
        raw.put("color", List.of("Black", "white", "black"));
        raw.put("wireless", "да");
        raw.put("switch_model", "  Omron   D2FC-F-7N ");

        SpecsValidator.Result r = mice(raw);

        assertThat(r.issues()).isEmpty();
        assertThat(r.specs()).containsEntry("weight_g", 51L)
                .containsEntry("dpi", Map.of("min", 50L, "max", 30000L))
                .containsEntry("sensor", "paw3950")
                .containsEntry("color", List.of("black", "white"))
                .containsEntry("wireless", true)
                .containsEntry("switch_model", "Omron D2FC-F-7N");
        // schema order: global first, then the category's own attributes by sort
        assertThat(r.specs().keySet()).first().isEqualTo("color");
    }

    @Test
    void aliasesAndLabelsResolveCaseInsensitively() {
        assertThat(mice(Map.of("sensor", "3950")).specs()).containsEntry("sensor", "paw3950");
        assertThat(mice(Map.of("sensor", "pixart paw3395")).specs()).containsEntry("sensor", "paw3395");
        assertThat(mice(Map.of("color", "ЧЕРНЫЙ")).specs()).containsEntry("color", List.of("black"));
        assertThat(mice(Map.of("color", "Чёрный uk")).specs()).containsEntry("color", List.of("black"));
    }

    @Test
    void numbersRangesAndDecimals() {
        assertThat(mice(Map.of("weight_g", 57.5)).specs()).containsEntry("weight_g", 57.5);
        assertThat(mice(Map.of("dpi", "50–30000")).specs()).containsEntry("dpi", Map.of("min", 50L, "max", 30000L));
        assertThat(mice(Map.of("dpi", 26000)).specs()).containsEntry("dpi", Map.of("min", 26000L, "max", 26000L));
        assertThat(mice(Map.of("weight_g", Map.of("min", 50, "max", 50))).specs()).containsEntry("weight_g", 50L);
    }

    @Test
    void errorsDropOnlyTheBadField() {
        Map<String, Object> raw = new HashMap<>();
        raw.put("weight_g", "лёгкая");
        raw.put("dpi", Map.of("min", 30000, "max", 50));
        raw.put("sensor", "Hero 2");
        raw.put("color", List.of("black", "plaid"));
        raw.put("wireless", "maybe");
        raw.put("switch_model", "   ");
        raw.put("polling_hz", 8000);
        raw.put("hot_swap", true); // keyboards only

        SpecsValidator.Result r = mice(raw);

        assertThat(reasons(r)).containsExactlyInAnyOrder("weight_g:NOT_A_NUMBER", "dpi:MIN_GT_MAX",
                "sensor:UNKNOWN_OPTION", "color:UNKNOWN_OPTION", "wireless:NOT_A_BOOL", "switch_model:EMPTY",
                "polling_hz:UNKNOWN_KEY", "hot_swap:UNKNOWN_KEY");
        assertThat(r.specs()).containsOnlyKeys("color");
        assertThat(r.specs()).containsEntry("color", List.of("black"));
    }

    @Test
    void outOfRangeTooLongAndWrongShapes() {
        assertThat(reasons(mice(Map.of("weight_g", -1)))).containsExactly("weight_g:OUT_OF_RANGE");
        assertThat(reasons(mice(Map.of("weight_g", 2e7)))).containsExactly("weight_g:OUT_OF_RANGE");
        assertThat(reasons(mice(Map.of("weight_g", Map.of("min", 40, "max", 60))))).containsExactly("weight_g:NOT_A_NUMBER");
        assertThat(reasons(mice(Map.of("switch_model", "x".repeat(300))))).containsExactly("switch_model:TOO_LONG");
        assertThat(reasons(mice(Map.of("sensor", List.of("paw3950", "paw3395"))))).containsExactly("sensor:NOT_A_STRING");
        assertThat(reasons(mice(Map.of("color", 5)))).containsExactly("color:NOT_A_LIST");
        assertThat(reasons(mice(Map.of("wireless", 2)))).containsExactly("wireless:NOT_A_BOOL");
    }

    @Test
    void nullMeansUnknownAndFalseIsKept() {
        Map<String, Object> raw = new HashMap<>();
        raw.put("weight_g", null);
        raw.put("wireless", false);
        SpecsValidator.Result r = mice(raw);
        assertThat(r.issues()).isEmpty();
        assertThat(r.specs()).containsOnlyKeys("wireless");
        assertThat(r.specs()).containsEntry("wireless", false);
    }

    @Test
    void inheritedAttributesApplyToTheLeaf() {
        SpecsValidator.Result r = SpecsValidator.validate(s.attributesFor(MAGNETIC),
                Map.of("hot_swap", true, "actuation_mm", "0.1..4", "color", "white"));
        assertThat(r.issues()).isEmpty();
        assertThat(r.specs()).containsEntry("actuation_mm", Map.of("min", 0.1, "max", 4L));
    }
}
