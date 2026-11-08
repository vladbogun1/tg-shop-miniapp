package com.maxsolch.shop.catalog.app;

import com.maxsolch.shop.catalog.app.NewProductCards.Input;
import com.maxsolch.shop.catalog.domain.CatalogSnapshot;
import com.maxsolch.shop.catalog.domain.CatalogSnapshot.Attr;
import com.maxsolch.shop.catalog.domain.CatalogSnapshot.Cat;
import com.maxsolch.shop.catalog.domain.CatalogSnapshot.Option;
import com.maxsolch.shop.catalog.domain.SpecType;

import java.util.List;

/**
 * Схема и товары эталонного промпта: те же данные, что в frontend-admin/features/cards/model/prompt-golden.test.ts.
 * Менять только вместе с ним (и с golden/new-product-prompt.txt).
 */
final class CardPromptFixtures {

    static final String MYSHKI = "c1";
    static final String WIRELESS = "c2";
    static final String KOVRIKI = "c3";

    private CardPromptFixtures() {
    }

    static CatalogSnapshot snapshot() {
        List<Cat> cats = List.of(
                cat(MYSHKI, null, "Мышки", "myshki", 1),
                cat(WIRELESS, MYSHKI, "Беспроводные", "myshki-wireless", 1),
                cat(KOVRIKI, null, "Коврики", "kovriki", 2));
        List<Attr> attrs = List.of(
                attr(null, "color", "Цвет", SpecType.ENUM, null, false, false, null, 0,
                        List.of(opt("black", "Чёрный"), opt("white", "Белый"), opt("red", "red"))),
                attr(MYSHKI, "weight_g", "Вес", SpecType.NUMBER, "г", false, true, "без кабеля", 1, List.of()),
                attr(MYSHKI, "dpi", "DPI", SpecType.NUMBER, null, true, false, null, 2, List.of()),
                attr(WIRELESS, "connectivity", "Подключение", SpecType.MULTI, null, false, false, null, 1,
                        List.of(opt("wired", "wired"), opt("2_4ghz", "2_4ghz"), opt("bt", "Bluetooth"))),
                attr(WIRELESS, "rgb", "Подсветка", SpecType.BOOL, null, false, false, null, 2, List.of()),
                attr(WIRELESS, "sensor", "Сенсор", SpecType.TEXT, null, false, false, null, 3, List.of()));
        return new CatalogSnapshot(cats, List.of(), List.of(), attrs);
    }

    static List<Input> items() {
        return List.of(
                new Input("p0a1b2c3d", "Мышь VGN Dragonfly F2 Ultra+ белая", "VGN", WIRELESS,
                        List.of("белая", "черная"), 2499L, null),
                new Input("p1f2e3d4c", "Коврик \"Test\" XL\\1", null, MYSHKI, List.of(), null, null),
                new Input("pdeadbeef", "Кабель", null, null, List.of(), null, null));
    }

    private static Cat cat(String id, String parent, String name, String slug, int sort) {
        return new Cat(id, parent, name, slug, sort, true, null, null, null, null, null);
    }

    private static Option opt(String value, String ru) {
        return new Option(value, ru, ru, ru, List.of(), 0);
    }

    private static Attr attr(String cat, String key, String ru, SpecType type, String unit, boolean range,
                             boolean required, String hint, int sort, List<Option> options) {
        return new Attr("a-" + key, cat, key, ru, ru, ru, type, unit, null, null, range, "main", false, false, required,
                false, sort, null, hint, options);
    }
}
