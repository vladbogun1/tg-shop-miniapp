package com.maxsolch.shop.delivery.domain;

import com.maxsolch.shop.delivery.domain.ParcelPacking.Unit;
import com.maxsolch.shop.platform.util.UuidUtil;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Boxes of {@code np_boxes} as presets (V99): a box with fold lines is one preset per height, a bag is as thick as
 * the goods. The four boxes are the ones marked «есть у нас» by the seed.
 */
class BoxOptionsTest {

    private static final NpBox NP1 = box("np-1", "Коробка 1 кг", 240, 170, "90", 80);
    private static final NpBox NP2 = box("np-2", "Коробка 2 кг", 340, 240, "90", 120);
    private static final NpBox NP5 = box("np-5", "Коробка 5 кг", 400, 240, "200,130,80", 200);
    private static final NpBox NP10 = box("np-10", "Коробка 10 кг", 400, 340, "285,200,140,85", 350);
    private static final NpBox BAG = bag("np-bag-1", "Пакет фирменный 1 кг", 360, 250);
    private static final NpBox BAG_S = bag("np-bag-s", "Пакет полиэтиленовый S", 490, 390);
    private static final List<NpBox> STOCK = List.of(NP1, NP2, NP5, NP10);

    private static final Unit DEF = new Unit(1000, 300, 200, 100, false);
    private static final Unit KEYBOARD = new Unit(1300, 380, 150, 50, true);
    private static final Unit HEADPHONES = new Unit(800, 230, 200, 95, true);
    private static final Unit PAD = new Unit(500, 380, 280, 4, true);
    private static final Unit GLIDES = new Unit(30, 120, 80, 10, true);

    static NpBox box(String code, String name, int l, int w, String heights, int tare) {
        NpBox b = new NpBox();
        b.setId(UuidUtil.randomBytes());
        b.setCode(code);
        b.setName(name);
        b.setKind(NpBox.KIND_BOX);
        b.setLengthMm(l);
        b.setWidthMm(w);
        b.setHeightsMm(heights);
        b.setTareG(tare);
        b.setPackMinor(1500);
        b.setInStock(true);
        return b;
    }

    static NpBox bag(String code, String name, int l, int w) {
        NpBox b = box(code, name, l, w, null, 15);
        b.setKind(NpBox.KIND_BAG);
        return b;
    }

    private static Parcel pack(List<NpBox> boxes, Unit... units) {
        return ParcelPacking.pack(List.of(units), DEF, BoxOptions.presets(boxes, List.of(units)));
    }

    @Test
    void everyFoldHeightIsAPreset() {
        assertThat(BoxOptions.expand(List.of(NP5), null)).extracting(BoxOptions.Option::label)
                .containsExactly("Коробка 5 кг", "Коробка 5 кг · 13 см", "Коробка 5 кг · 8 см");
        assertThat(BoxOptions.expand(List.of(NP10), null)).extracting(BoxOptions.Option::label)
                .contains("Коробка 10 кг · 8,5 см");
    }

    @Test
    void aKeyboardGoesIntoTheFiveKiloBoxFoldedToEightCm() {
        Parcel p = pack(STOCK, KEYBOARD);
        assertThat(p.seats()).hasSize(1);
        assertThat(p.seats().get(0).box()).isEqualTo("Коробка 5 кг · 8 см");
        assertThat(p.heightMm()).isEqualTo(80);
        assertThat(p.weightG()).isEqualTo(1300 + 200);
    }

    @Test
    void headphonesNeverGoIntoAnEightCmBox() {
        Parcel p = pack(STOCK, HEADPHONES);
        assertThat(p.seats()).allSatisfy(s -> {
            assertThat(s.heightMm()).isGreaterThanOrEqualTo(95);
            assertThat(s.box()).doesNotContain("· 8 см").doesNotContain("· 8,5 см");
        });
    }

    @Test
    void aBagIsAsThickAsTheGoodsStacked() {
        assertThat(BoxOptions.bagHeight(List.of(PAD, GLIDES))).isEqualTo(BoxOptions.BAG_MIN_MM + 4);
        assertThat(BoxOptions.bagHeight(List.of(GLIDES))).isEqualTo(BoxOptions.BAG_MIN_MM);
        assertThat(BoxOptions.bagHeight(List.of(HEADPHONES, HEADPHONES))).isEqualTo(BoxOptions.BAG_MAX_MM);
        BoxOptions.Option o = BoxOptions.expand(List.of(BAG), List.of(PAD, GLIDES)).get(0);
        assertThat(o.heightMm()).isEqualTo(14);
        assertThat(o.label()).isEqualTo("Пакет фирменный 1 кг");
    }

    @Test
    void withoutGoodsBagsAreLeftOut() {
        assertThat(BoxOptions.presets(List.of(BAG, NP1), null)).extracting(ParcelPacking.BoxPreset::name)
                .containsExactly("Коробка 1 кг");
    }

    @Test
    void aFlatPadTooBigForTheSmallBagGoesIntoTheBigOne() {
        Parcel p = pack(List.of(BAG, BAG_S, NP5), PAD);
        assertThat(p.seats().get(0).box()).isEqualTo("Пакет полиэтиленовый S");
        assertThat(p.heightMm()).isEqualTo(10);
    }

    @Test
    void allowsOnlyFoldHeightsAndBagThickness() {
        assertThat(BoxOptions.allows(NP5, 130)).isTrue();
        assertThat(BoxOptions.allows(NP5, 100)).isFalse();
        assertThat(BoxOptions.allows(BAG, 60)).isTrue();
        assertThat(BoxOptions.allows(BAG, 200)).isFalse();
        assertThat(BoxOptions.cm(85)).isEqualTo("8,5");
    }
}
