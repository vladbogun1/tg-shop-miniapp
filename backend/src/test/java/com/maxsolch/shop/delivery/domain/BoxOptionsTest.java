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


    // 13.11.2026: two bags went to NP as the empty bag laid flat — 49×39×12 cm = 5.73 kg by volume for 670 g
    // (IEM + ear tips, sizes from their categories) and 49×39×4 cm = 1.91 kg for 520 g (a mouse pad).
    private static final Unit IEM = new Unit(300, 150, 100, 60, false);
    private static final Unit EAR_TIPS = new Unit(350, 150, 100, 80, false);
    private static final Unit PAD_DEFAULT = new Unit(500, 380, 280, 40, false);

    @Test
    void aBagIsTheGoodsWrappedInIt_notTheEmptyBag() {
        assertThat(BoxOptions.volumeWeightG(490, 390, 120)).isEqualTo(5733);
        assertThat(BoxOptions.volumeWeightG(490, 390, 40)).isEqualTo(1911);

        List<Unit> iem = List.of(IEM, EAR_TIPS);
        assertThat(BoxOptions.bagFootprint(490, 390, iem)).containsExactly(170, 120);
        assertThat(BoxOptions.bagHeight(iem)).isEqualTo(120);
        assertThat(BoxOptions.volumeWeightG(170, 120, 120)).isEqualTo(612);

        assertThat(BoxOptions.bagFootprint(390, 490, List.of(PAD_DEFAULT))).containsExactly(400, 300);
        assertThat(BoxOptions.volumeWeightG(400, 300, 40)).isEqualTo(1200);
    }

    @Test
    void aBagFootprintNeverOutgrowsTheBag_andFallsBackToItWithoutGoods() {
        assertThat(BoxOptions.bagFootprint(490, 390, List.of(new Unit(500, 900, 400, 3, true))))
                .containsExactly(490, 390);
        assertThat(BoxOptions.bagFootprint(490, 390, List.of())).containsExactly(490, 390);
    }

    @Test
    void aSuggestedBagParcelIsCutDownToTheGoods_aBoxIsNot() {
        List<Unit> iem = List.of(IEM, EAR_TIPS);
        Parcel bagged = ParcelPacking.pack(iem, DEF, BoxOptions.presets(List.of(BAG_S), iem));
        assertThat(bagged.seats().get(0).box()).isEqualTo("Пакет полиэтиленовый S");
        assertThat(bagged.lengthMm()).isEqualTo(490);

        Parcel wrapped = BoxOptions.wrapBag(bagged, List.of(BAG_S, NP2), iem);
        assertThat(wrapped.seats()).singleElement().satisfies(s -> {
            assertThat(s.lengthMm()).isEqualTo(170);
            assertThat(s.widthMm()).isEqualTo(120);
            assertThat(s.heightMm()).isEqualTo(120);
        });
        assertThat(wrapped.volumetricKg()).isLessThan(0.62);
        assertThat(wrapped.weightG()).isEqualTo(bagged.weightG());

        Parcel boxed = ParcelPacking.pack(iem, DEF, BoxOptions.presets(List.of(NP2), iem));
        assertThat(BoxOptions.wrapBag(boxed, List.of(BAG_S, NP2), iem)).isSameAs(boxed);
    }

    @Test
    void aBagFarBulkierThanItsWeightIsFlagged() {
        assertThat(BoxOptions.bagVolumeWarning(490, 390, 120, 670)).contains("5,73 кг по объёму")
                .contains("0,67 кг");
        assertThat(BoxOptions.bagVolumeWarning(170, 120, 120, 670)).isNull();
        assertThat(BoxOptions.bagVolumeWarning(400, 300, 40, 520)).isNull();
        assertThat(BoxOptions.bagVolumeWarning(490, 390, 40, 520)).contains("1,91");
    }
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

    @Test
    void aSoftBagFoldsIntoAParcelLockerCellWhenTheGoodsFit() {
        int[] cell = {300, 400, 600};
        assertThat(BoxOptions.foldBag(550, 500, 30, List.of(GLIDES), cell)).containsExactly(550, 400);
        assertThat(BoxOptions.foldBag(500, 550, 30, List.of(KEYBOARD), cell)).containsExactly(550, 400);
        // already fits — nothing to fold
        assertThat(BoxOptions.foldBag(360, 250, 30, List.of(GLIDES), cell)).isNull();
        // a pad 38×28 still lies flat in 55×40; a 45×42 one does not
        assertThat(BoxOptions.foldBag(550, 500, 10, List.of(PAD), cell)).containsExactly(550, 400);
        assertThat(BoxOptions.foldBag(550, 500, 10, List.of(new Unit(600, 450, 420, 4, true)), cell)).isNull();
    }
}
