package com.maxsolch.shop.delivery.domain;

import com.fasterxml.jackson.databind.node.ObjectNode;
import com.maxsolch.shop.order.domain.NpServiceType;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/** InternetDocument.save properties: who pays, money, box, both sides, units. */
class WaybillRequestTest {

    private static final WaybillRequest.Party SENDER =
            new WaybillRequest.Party("s-cp", "s-contact", "380501112233", "city-kyiv", "wh-65");
    private static final WaybillRequest.Party RECIPIENT =
            new WaybillRequest.Party("r-cp", "r-contact", "380671234567", "city-lviv", "wh-lviv-1");
    private static final Parcel BOX = new Parcel(350, 255, 181, 95, "test");

    private static WaybillRequest.Spec spec(NpServiceType service, long declared, long cod, Parcel p) {
        return new WaybillRequest.Spec(null, SENDER, RECIPIENT, service.npServiceType(),
                service == NpServiceType.POSTOMAT, p, declared, cod, "Комп'ютерні аксесуари",
                LocalDate.of(2026, 10, 24), "1a2b3c4d", null);
    }

    @Test
    void branchWithMoneyOnDelivery() {
        ObjectNode p = WaybillRequest.build(spec(NpServiceType.WAREHOUSE, 2_599_00, 2_499_00, BOX));

        assertThat(p.has("Ref")).isFalse();
        assertThat(p.get("PayerType").asText()).isEqualTo("Recipient");
        assertThat(p.get("PaymentMethod").asText()).isEqualTo("Cash");
        assertThat(p.get("DateTime").asText()).isEqualTo("24.10.2026");
        assertThat(p.get("ServiceType").asText()).isEqualTo("WarehouseWarehouse");
        assertThat(p.get("CargoType").asText()).isEqualTo("Parcel");
        assertThat(p.get("SeatsAmount").asText()).isEqualTo("1");
        assertThat(p.get("Weight").asText()).isEqualTo("0.35");
        assertThat(p.get("Cost").asText()).isEqualTo("2599");
        assertThat(p.get("AfterpaymentOnGoodsCost").asText()).isEqualTo("2499");
        assertThat(p.has("BackwardDeliveryData")).isFalse();
        assertThat(p.get("InfoRegClientBarcodes").asText()).isEqualTo("1a2b3c4d");
        assertThat(p.get("Description").asText()).isEqualTo("Комп'ютерні аксесуари");

        assertThat(p.get("Sender").asText()).isEqualTo("s-cp");
        assertThat(p.get("CitySender").asText()).isEqualTo("city-kyiv");
        assertThat(p.get("SenderAddress").asText()).isEqualTo("wh-65");
        assertThat(p.get("ContactSender").asText()).isEqualTo("s-contact");
        assertThat(p.get("SendersPhone").asText()).isEqualTo("380501112233");
        assertThat(p.get("Recipient").asText()).isEqualTo("r-cp");
        assertThat(p.get("CityRecipient").asText()).isEqualTo("city-lviv");
        assertThat(p.get("RecipientAddress").asText()).isEqualTo("wh-lviv-1");
        assertThat(p.get("ContactRecipient").asText()).isEqualTo("r-contact");
        assertThat(p.get("RecipientsPhone").asText()).isEqualTo("380671234567");

        // 255×181×95 mm → 26×19×10 cm (rounded up) → 0.00494 m³ → 0.005 (4 decimals, up)
        var seat = p.get("OptionsSeat").get(0);
        assertThat(seat.get("volumetricLength").asText()).isEqualTo("26");
        assertThat(seat.get("volumetricWidth").asText()).isEqualTo("19");
        assertThat(seat.get("volumetricHeight").asText()).isEqualTo("10");
        assertThat(seat.get("volumetricVolume").asText()).isEqualTo("0.005");
        assertThat(seat.get("weight").asText()).isEqualTo("0.35");
        assertThat(p.get("VolumeGeneral").asText()).isEqualTo("0.005");
    }

    @Test
    void everySeatGoesToOptionsSeat() {
        Parcel two = Parcel.of(List.of(
                new Parcel.Seat(11_000, 400, 340, 280, "Коробка 10 кг"),
                new Parcel.Seat(1_600, 400, 240, 80, "Плоская 5 кг")), "2 места", 8000);
        ObjectNode p = WaybillRequest.build(spec(NpServiceType.WAREHOUSE, 2_599_00, 0, two));

        assertThat(p.get("SeatsAmount").asText()).isEqualTo("2");
        assertThat(p.get("Weight").asText()).isEqualTo("12.6");
        assertThat(p.get("OptionsSeat")).hasSize(2);
        var second = p.get("OptionsSeat").get(1);
        assertThat(second.get("volumetricLength").asText()).isEqualTo("40");
        assertThat(second.get("volumetricHeight").asText()).isEqualTo("8");
        assertThat(second.get("weight").asText()).isEqualTo("1.6");
        // 0.0381 + 0.00768 m³
        assertThat(p.get("VolumeGeneral").asText()).isEqualTo("0.0458");
    }

    @Test
    void fullyPaidOrderHasNoAfterpaymentAndUpdateCarriesTheRef() {
        WaybillRequest.Spec s = spec(NpServiceType.POSTOMAT, 1_000_50, 0, BOX);
        ObjectNode p = WaybillRequest.build(new WaybillRequest.Spec("doc-ref", s.sender(), s.recipient(), s.serviceType(), s.postomat(),
                s.parcel(), s.declaredMinor(), s.codMinor(), s.description(), s.date(), s.barcode(), "крихке"));
        assertThat(p.get("Ref").asText()).isEqualTo("doc-ref");
        assertThat(p.get("ServiceType").asText()).isEqualTo("WarehousePostomat");
        assertThat(p.has("AfterpaymentOnGoodsCost")).isFalse();
        assertThat(p.get("Cost").asText()).isEqualTo("1001");
        assertThat(p.get("AdditionalInformation").asText()).isEqualTo("крихке");
    }

    @Test
    void declaredValueNeverBelowTheMoneyCollected() {
        ObjectNode p = WaybillRequest.build(spec(NpServiceType.DOORS, 500_00, 1_250_50, BOX));
        assertThat(p.get("ServiceType").asText()).isEqualTo("WarehouseDoors");
        assertThat(p.get("Cost").asText()).isEqualTo("1251");
        assertThat(p.get("AfterpaymentOnGoodsCost").asText()).isEqualTo("1250.5");
    }

    @Test
    void documentsGoAtOneOfNpsThreeWeights() {
        // NP refuses any other weight for «Документи» («Weight is not allowed for Documents», order #5183559b, 13.11).
        Parcel envelope = new Parcel(130, 200, 150, 10, "test").withDocuments(true);
        ObjectNode p = WaybillRequest.build(spec(NpServiceType.WAREHOUSE, 100_00, 0, envelope));

        assertThat(p.get("CargoType").asText()).isEqualTo("Documents");
        assertThat(p.get("Weight").asText()).isEqualTo("0.5");
        assertThat(p.has("OptionsSeat")).isFalse();
        assertThat(p.has("VolumeGeneral")).as("NP: «VolumeWeight must be empty» for documents").isFalse();
        assertThat(List.of(60, 100, 101, 500, 501, 1000).stream()
                .map(g -> WaybillRequest.weight(new Parcel(g, 200, 150, 10, "test").withDocuments(true))))
                .containsExactly("0.1", "0.1", "0.5", "0.5", "1", "1");
        assertThat(WaybillRequest.weight(new Parcel(130, 200, 150, 10, "test"))).isEqualTo("0.13");
    }

    @Test
    void heavyParcelIsCargoExceptForALocker() {
        var heavy = new Parcel(31_000, 600, 400, 400, "test");
        assertThat(WaybillRequest.build(spec(NpServiceType.WAREHOUSE, 100, 0, heavy)).get("CargoType").asText()).isEqualTo("Cargo");
        assertThat(WaybillRequest.build(spec(NpServiceType.POSTOMAT, 100, 0, heavy)).get("CargoType").asText()).isEqualTo("Parcel");
    }

    @Test
    void units() {
        assertThat(WaybillRequest.kg(20)).isEqualTo("0.1");
        assertThat(WaybillRequest.kg(1000)).isEqualTo("1");
        assertThat(WaybillRequest.kg(1234)).isEqualTo("1.234");
        assertThat(WaybillRequest.cm(1)).isEqualTo("1");
        assertThat(WaybillRequest.cm(100)).isEqualTo("10");
        assertThat(WaybillRequest.cm(101)).isEqualTo("11");
        assertThat(WaybillRequest.uah(0)).isEqualTo("0");
        assertThat(WaybillRequest.uah(100_00)).isEqualTo("100");
        assertThat(WaybillRequest.uahCeil(1)).isEqualTo("1");
        assertThat(WaybillRequest.uahCeil(0)).isEqualTo("1");
        assertThat(WaybillRequest.m3(new Parcel(100, 10, 10, 10, "x"))).isEqualTo("0.0001");
    }
}
