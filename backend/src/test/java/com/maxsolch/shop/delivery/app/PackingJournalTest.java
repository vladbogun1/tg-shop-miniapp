package com.maxsolch.shop.delivery.app;

import com.maxsolch.shop.delivery.domain.OrderShipment;
import com.maxsolch.shop.delivery.domain.Parcel;
import com.maxsolch.shop.delivery.domain.ShipmentStage;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/** «Журнал упаковки» flags: another box than suggested; NP charged another weight (> 15 %) or price. */
class PackingJournalTest {

    private static OrderShipment row() {
        OrderShipment s = NpFixtures.api(ShipmentStage.IN_TRANSIT);
        s.setWeightG(1500);
        s.setLengthMm(400);
        s.setWidthMm(240);
        s.setHeightMm(80); // 400×240×80 / 4000 = 1920 g volumetric
        s.setDeliveryCostMinor(9500L);
        return s;
    }

    @Test
    void mismatchIsAnotherBoxThanSuggested() {
        OrderShipment s = row();
        assertThat(PackingJournal.mismatch(s)).isFalse();
        s.setBoxSuggested("Коробка 5 кг · 8 см");
        s.setBoxLabel("Коробка 5 кг · 8 см");
        assertThat(PackingJournal.mismatch(s)).isFalse();
        s.setBoxLabel("Коробка 10 кг · 8,5 см");
        assertThat(PackingJournal.mismatch(s)).isTrue();
    }

    @Test
    void remeasuredComparesWithTheLargerOfRealAndVolumetric() {
        OrderShipment s = row();
        assertThat(PackingJournal.declaredChargeable(s)).isEqualTo(1920);
        s.setNpWeightG(2000);
        s.setNpCostMinor(9500L);
        assertThat(PackingJournal.remeasured(s)).isFalse();
        s.setNpWeightG(5000);
        assertThat(PackingJournal.remeasured(s)).isTrue();
    }

    @Test
    void anotherPriceIsRemeasuredToo() {
        OrderShipment s = row();
        s.setNpCostMinor(19550L);
        assertThat(PackingJournal.remeasured(s)).isTrue();
        s.setNpCostMinor(null);
        assertThat(PackingJournal.remeasured(s)).isFalse();
    }

    @Test
    void severalSeatsCountEachSeatsOwnLargerWeight() {
        OrderShipment s = row();
        s.setSeatsJson(PackingPlaces.json(Parcel.of(List.of(new Parcel.Seat(1400, 100, 100, 100, "Коробка"),
                new Parcel.Seat(100, 400, 300, 50, "Конверт")), "t", 0)));
        // NP prices every seat on its own: 1400 g real + 1500 g volumetric, not max(1500 g real, 1750 g volumetric).
        assertThat(PackingJournal.declaredChargeable(s)).isEqualTo(2900);
        assertThat(PackingJournal.row(s, null).seats()).hasSize(2);
        assertThat(PackingJournal.row(row(), null).seats()).isNull();
    }
}
