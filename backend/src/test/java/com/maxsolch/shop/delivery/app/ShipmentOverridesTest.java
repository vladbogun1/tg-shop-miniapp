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
}
