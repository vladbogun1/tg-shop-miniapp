package com.maxsolch.shop.catalog;

import java.util.List;

/**
 * A small schema for the catalog tests: root «Клавиатуры» with leaves «Магнитные» / «Механические»,
 * a leaf root «Мыши», a global multi «color», keyboard attributes on the parent and on a leaf.
 */
public final class CatalogFixtures {

    public static final String KEYBOARDS = "20000000-0000-0000-0000-000000000001";
    public static final String MAGNETIC = "20000000-0000-0000-0000-000000000002";
    public static final String MECHANICAL = "20000000-0000-0000-0000-000000000003";
    public static final String MICE = "20000000-0000-0000-0000-000000000004";
    public static final String LAMZU = "30000000-0000-0000-0000-000000000001";

    private CatalogFixtures() {
    }

    public static CatalogSnapshot.Option opt(String value, String ru, String... aliases) {
        return new CatalogSnapshot.Option(value, ru, ru + " uk", ru + " en", List.of(aliases), 0);
    }

    public static CatalogSnapshot.Attr attr(String key, String categoryId, SpecType type, boolean required,
                                            boolean range, List<CatalogSnapshot.Option> options) {
        return new CatalogSnapshot.Attr("a-" + key, categoryId, key, key, key, key, type, null, null, null, range,
                "main", true, true, required, false, 10, null, null, options);
    }

    public static CatalogSnapshot snapshot() {
        List<CatalogSnapshot.Cat> cats = List.of(
                new CatalogSnapshot.Cat(KEYBOARDS, null, "Клавиатуры", "klaviatury", 20, true, "keyboard",
                        null, null, null, null),
                new CatalogSnapshot.Cat(MAGNETIC, KEYBOARDS, "Магнитные", "klv-magnitnye", 30, true, null,
                        null, null, null, null),
                new CatalogSnapshot.Cat(MECHANICAL, KEYBOARDS, "Механические", "klv-mekhanicheskie", 40, true, null,
                        null, null, null, null),
                new CatalogSnapshot.Cat(MICE, null, "Мыши", "myshki", 10, true, "mouse", null, null, null, null));
        List<CatalogSnapshot.Attr> attrs = List.of(
                attr("color", null, SpecType.MULTI, false, false,
                        List.of(opt("black", "Чёрный", "черный", "black"), opt("white", "Белый", "white"))),
                attr("weight_g", MICE, SpecType.NUMBER, true, false, List.of()),
                attr("dpi", MICE, SpecType.NUMBER, false, true, List.of()),
                attr("sensor", MICE, SpecType.ENUM, true, false,
                        List.of(opt("paw3950", "PixArt PAW3950", "PAW3950", "3950"), opt("paw3395", "PixArt PAW3395"))),
                attr("wireless", MICE, SpecType.BOOL, false, false, List.of()),
                attr("switch_model", MICE, SpecType.TEXT, false, false, List.of()),
                attr("hot_swap", KEYBOARDS, SpecType.BOOL, true, false, List.of()),
                attr("actuation_mm", MAGNETIC, SpecType.NUMBER, true, true, List.of()));
        List<CatalogSnapshot.BrandInfo> brands = List.of(
                new CatalogSnapshot.BrandInfo(LAMZU, "Lamzu", "lamzu", List.of("LAMZU"), null, 0));
        return new CatalogSnapshot(cats, brands, List.of(new CatalogSnapshot.Group("main", "Основное", "Основне",
                "General", 10)), attrs);
    }
}
