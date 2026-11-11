package com.maxsolch.shop.delivery.domain;

import org.junit.jupiter.api.Test;

import java.util.Collections;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Parcel weight and boxes (shipments audit 2026-10, §5): the smallest preset holding the largest unit
 * with the goods within 60 % of its volume, tare added; what does not fit goes to the next seat.
 */
class ParcelPackingTest {

    private static final ParcelPacking.Unit DEF = new ParcelPacking.Unit(1000, 300, 200, 100, false);

    /** The default «Коробки» setting (audit §4). */
    private static final List<ParcelPacking.BoxPreset> AUDIT = ParcelPacking.parsePresets("""
            Пакет НП: 390×290×70 / 50 г / 0 ₴
            Коробка 1 кг: 240×170×98 / 100 г / 15 ₴
            Коробка 2 кг: 340×240×98 / 200 г / 15 ₴
            Плоская 5 кг: 400×240×80 / 300 г / 40 ₴
            Коробка 5 кг: 400×240×200 / 350 г / 40 ₴
            Коробка 10 кг: 400×340×280 / 600 г / 40 ₴
            """);

    private static final ParcelPacking.Unit MOUSE = new ParcelPacking.Unit(350, 190, 130, 80, true);
    private static final ParcelPacking.Unit KEYBOARD = new ParcelPacking.Unit(1300, 380, 150, 50, true);
    private static final ParcelPacking.Unit HEADPHONES = new ParcelPacking.Unit(800, 230, 200, 95, true);
    private static final ParcelPacking.Unit PAD = new ParcelPacking.Unit(500, 380, 280, 40, true);
    private static final ParcelPacking.Unit GLIDES = new ParcelPacking.Unit(30, 120, 80, 10, true);
    private static final ParcelPacking.Unit CHAIR = new ParcelPacking.Unit(20000, 700, 600, 350, true);

    @Test
    void presetsParse() {
        List<ParcelPacking.BoxPreset> p = ParcelPacking.parsePresets("""
                Мышь: 250×180×100
                Клавиатура - 50x20x8 см
                Коробка 1 кг: 240×170×98 / 100 г / 15 ₴
                Пакет: 390x290x70 / тара 50 г
                Плоская: 400×240×80; 300 г; 12,50 грн
                мусор
                Ноль: 0x10x10
                """);
        assertThat(p).containsExactly(
                new ParcelPacking.BoxPreset("Мышь", 250, 180, 100),
                new ParcelPacking.BoxPreset("Клавиатура", 500, 200, 80),
                new ParcelPacking.BoxPreset("Коробка 1 кг", 240, 170, 98, 100, 1500),
                new ParcelPacking.BoxPreset("Пакет", 390, 290, 70, 50, 0),
                new ParcelPacking.BoxPreset("Плоская", 400, 240, 80, 300, 1250));
        assertThat(ParcelPacking.parsePresets(null)).isEmpty();
        assertThat(AUDIT).hasSize(6);
    }

    @Test
    void emptyOrderGetsTheDefaults() {
        Parcel p = ParcelPacking.pack(List.of(), DEF, AUDIT);
        assertThat(p.weightG()).isEqualTo(1000);
        assertThat(p.lengthMm()).isEqualTo(300);
        assertThat(p.seats()).hasSize(1);
    }

    @Test
    void oneItemGoesIntoItsBoxWithTheTare() {
        assertBox(List.of(MOUSE), "Коробка 1 кг", 450, 1500);
        assertBox(List.of(KEYBOARD), "Плоская 5 кг", 1600, 4000);
        assertBox(List.of(HEADPHONES), "Коробка 2 кг", 1000, 1500);
        assertBox(List.of(PAD), "Пакет НП", 550, 0);
    }

    @Test
    void severalItemsShareTheSmallestBoxWithinTheFillFactor() {
        // 2 mice = 3.95 l: not within 60 % of the 1 kg box (4.0 l); the flat one (7.68 l) is smaller
        // by volume than the 2 kg box (8.0 l), so it wins (audit §5: the smallest by volume).
        assertBox(List.of(MOUSE, MOUSE), "Плоская 5 кг", 1000, 4000);
        // Keyboard + mouse: the flat box would hold the sides but not 60 % of its volume.
        assertBox(List.of(KEYBOARD, MOUSE), "Коробка 5 кг", 2000, 4000);
        assertBox(List.of(PAD, GLIDES), "Пакет НП", 580, 0);
    }

    @Test
    void whatDoesNotFitOneBoxGoesToTheNextSeat() {
        List<ParcelPacking.Unit> units = Collections.nCopies(8, KEYBOARD);
        Parcel p = ParcelPacking.pack(units, DEF, AUDIT);
        // 10 kg box: 38.1 l × 0.6 = 22.8 l → 8 keyboards of 2.85 l (22.8 l) — exactly one box.
        assertThat(p.seats()).hasSize(1);

        Parcel two = ParcelPacking.pack(Collections.nCopies(9, KEYBOARD), DEF, AUDIT);
        assertThat(two.seats()).hasSize(2);
        assertThat(two.seats().get(0).box()).isEqualTo("Коробка 10 кг");
        assertThat(two.seats().get(1).box()).isEqualTo("Плоская 5 кг");
        assertThat(two.weightG()).isEqualTo(9 * 1300 + 600 + 300);
        assertThat(two.packMinor()).isEqualTo(8000);
        assertThat(two.source()).isEqualTo("2 места: «Коробка 10 кг» + «Плоская 5 кг»");
        assertThat(two.lengthMm()).isEqualTo(400);
    }

    @Test
    void anItemBiggerThanEveryBoxIsASeatOfItsOwn() {
        Parcel p = ParcelPacking.pack(List.of(CHAIR, MOUSE), DEF, AUDIT);
        assertThat(p.seats()).containsExactly(
                new Parcel.Seat(20000, 700, 600, 350, null),
                new Parcel.Seat(450, 240, 170, 98, "Коробка 1 кг"));
        assertThat(p.weightG()).isEqualTo(20450);
        assertThat(p.source()).isEqualTo("2 места: своя упаковка + «Коробка 1 кг»");
    }

    @Test
    void withoutPresetsOneItemKeepsItsSizeAndSeveralGoByVolume() {
        Parcel one = ParcelPacking.pack(List.of(MOUSE), DEF, List.of());
        assertThat(one).isEqualTo(new Parcel(350, 190, 130, 80, "из карточки товара"));
        var big = new ParcelPacking.Unit(2000, 700, 300, 100, true);
        Parcel p = ParcelPacking.pack(List.of(big, big), DEF, List.of());
        assertThat(p.weightG()).isEqualTo(4000);
        assertThat(p.source()).isEqualTo("по объёму товаров");
        assertThat(new int[]{p.lengthMm(), p.widthMm(), p.heightMm()}).containsExactly(700, 300, 200);
    }

    @Test
    void identicalUnitsAreCountedOneByOne() {
        // 3 mice: 5.9 l — over 60 % of the 2 kg box, within the 5 kg one; all three, none lost to equals().
        Parcel p = ParcelPacking.pack(List.of(MOUSE, MOUSE, MOUSE), DEF, AUDIT);
        assertThat(p.seats()).hasSize(1);
        assertThat(p.seats().get(0).box()).isEqualTo("Коробка 5 кг");
        assertThat(p.weightG()).isEqualTo(3 * 350 + 350);
    }

    private static void assertBox(List<ParcelPacking.Unit> units, String box, int weightG, long packMinor) {
        Parcel p = ParcelPacking.pack(units, DEF, AUDIT);
        assertThat(p.seats()).hasSize(1);
        assertThat(p.seats().get(0).box()).isEqualTo(box);
        assertThat(p.weightG()).isEqualTo(weightG);
        assertThat(p.packMinor()).isEqualTo(packMinor);
        assertThat(p.source()).isEqualTo("коробка «" + box + "»");
    }
}
