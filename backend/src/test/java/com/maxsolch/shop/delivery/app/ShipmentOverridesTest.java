package com.maxsolch.shop.delivery.app;

import com.maxsolch.shop.delivery.app.ShipmentCommands.Options;
import com.maxsolch.shop.delivery.domain.Parcel;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/** The «Створити ТТН» dialog: unchanged size fields keep the packed seats, an edited one makes one manual seat. */
class ShipmentOverridesTest {

    private static final Parcel TWO = Parcel.of(List.of(
            new Parcel.Seat(11_000, 400, 340, 280, "Коробка 10 кг"),
            new Parcel.Seat(1_600, 400, 240, 80, "Плоская 5 кг")), "2 места", 8000);

    private static Options box(Integer weightG, Integer l, Integer w, Integer h) {
        return new Options(null, weightG, l, w, h, null, null, null, null, null, null, null, false, null);
    }

    @Test
    void unchangedFieldsKeepTheSeats() {
        assertThat(ShipmentPreparation.withOverrides(TWO, Options.defaults())).isSameAs(TWO);
        // What the dialog shows and sends back: the total weight and the first seat in whole cm.
        assertThat(ShipmentPreparation.withOverrides(TWO, box(12_600, 400, 340, 280))).isSameAs(TWO);
    }

    @Test
    void anEditedFieldMakesOneManualSeat() {
        Parcel p = ShipmentPreparation.withOverrides(TWO, box(9_000, null, null, null));
        assertThat(p.seats()).hasSize(1);
        assertThat(p.weightG()).isEqualTo(9_000);
        assertThat(p.lengthMm()).isEqualTo(400);
        assertThat(p.source()).isEqualTo("указано вручную");
        assertThat(p.packMinor()).isZero();
    }

    @Test
    void thePackersSeatsAreSentAsTheyAre() {
        List<Parcel.Seat> seats = List.of(new Parcel.Seat(850, 400, 240, 80, "Коробка 5 кг · 8 см"),
                new Parcel.Seat(700, 490, 420, 10, "Стрейч 49×42 см"));
        Options o = new Options(null, 1550, 400, 240, 80, null, null, null, null, null, null, null, true, null, seats);

        Parcel p = ShipmentPreparation.withOverrides(TWO, o);

        assertThat(p.seats()).isEqualTo(seats);
        assertThat(p.weightG()).isEqualTo(1550);
        assertThat(p.documents()).isFalse();
        // NP counts the volume of each seat: 400×240×80 + 490×420×10 mm → 1.92 + 0.51 kg, not the mat's box.
        assertThat(p.volumetricKg()).isCloseTo(2.435, org.assertj.core.data.Offset.offset(0.01));
    }

    @Test
    void severalSeatsAreLabelledAndKnownByTheirLabel() {
        assertThat(PackingPlaces.label(List.of("A", "B"))).isEqualTo("2 места: A + B");
        assertThat(PackingPlaces.label(List.of("A", "B", "C", "D", "E"))).startsWith("5 мест: ");
        assertThat(PackingPlaces.label(List.of("x".repeat(80), "y".repeat(80)))).hasSize(120).endsWith("…");
        assertThat(PackingPlaces.multi("2 места: A + B")).isTrue();
        assertThat(PackingPlaces.multi("Коробка 5 кг · 8 см")).isFalse();
        assertThat(PackingPlaces.multi(null)).isFalse();
    }
}
