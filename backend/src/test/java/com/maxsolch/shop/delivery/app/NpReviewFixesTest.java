package com.maxsolch.shop.delivery.app;

import com.maxsolch.shop.delivery.domain.NovaPoshtaException;
import com.maxsolch.shop.delivery.domain.NovaPoshtaWarehouse;
import com.maxsolch.shop.delivery.domain.OrderShipment;
import com.maxsolch.shop.delivery.domain.Parcel;
import com.maxsolch.shop.delivery.domain.ShipmentStage;
import com.maxsolch.shop.delivery.domain.ShipmentStatusMapper;
import com.maxsolch.shop.order.app.ShippingOrder;
import com.maxsolch.shop.order.domain.DeliveryMethod;
import com.maxsolch.shop.order.domain.NpServiceType;
import com.maxsolch.shop.order.domain.OrderStatus;
import com.maxsolch.shop.settings.app.SettingsService;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/** The fixes of the NP review (branch np-integration), on the v2 classes. */
class NpReviewFixesTest {

    private static final Instant NOW = Instant.parse("2026-10-23T10:00:00Z");
    private static final ParcelIssues.ParcelLimits LIMITS = new ParcelIssues.ParcelLimits(5, 2, 60);
    private static final String P1 = "50b36463-e893-4525-981b-9ee535d10d0e";
    private static final String GIFT = "1c5e1b6a-fd23-45bd-9237-ab4bdb015117";

    @Test
    void ownStatusCodesOverrideTheTableAndBadLinesAreSkipped() {
        Map<Integer, ShipmentStage> own = ShipmentStatusMapper.parseOverrides("115 = in_transit\n7: RETURNING\nчушь\n9 = NOPE");
        assertThat(own).containsEntry(115, ShipmentStage.IN_TRANSIT).containsEntry(7, ShipmentStage.RETURNING).hasSize(2);
        assertThat(ShipmentStatusMapper.stageOf("115", own)).isEqualTo(ShipmentStage.IN_TRANSIT);
        assertThat(ShipmentStatusMapper.stageOf("115")).isNull();
        assertThat(ShipmentStatusMapper.stageOf(" 7 ", own)).isEqualTo(ShipmentStage.RETURNING);
        assertThat(ShipmentStatusMapper.stageOf("106")).isEqualTo(ShipmentStage.RECEIVED);
    }

    @Test
    void aTypedInWaybillMovesTheOrderOnlyForOurRecipient() {
        assertThat(ShipmentStatusApplier.samePhone("380671234567", "+38 (067) 123-45-67")).isTrue();
        assertThat(ShipmentStatusApplier.samePhone("380671234567", "0671234567")).isTrue();
        assertThat(ShipmentStatusApplier.samePhone("380671234560", "0671234567")).isFalse();
        assertThat(ShipmentStatusApplier.samePhone(null, "0671234567")).isFalse();
        assertThat(ShipmentStatusApplier.samePhone("", "")).isFalse();
    }

    @Test
    void postomatCellComesFromTheDirectoryThenTheSetting() {
        assertThat(PostomatLimits.parseBox("600×400×300")).containsExactly(300, 400, 600);
        assertThat(PostomatLimits.parseBox("300 x 600 x 400")).containsExactly(300, 400, 600);
        assertThat(PostomatLimits.parseBox("мусор")).containsExactly(PostomatLimits.DEFAULT_BOX_MM);

        Parcel box = new Parcel(2000, 350, 250, 120, "t");
        assertThat(PostomatLimits.fits(box, new int[]{300, 400, 600})).isTrue();
        assertThat(PostomatLimits.fits(box, new int[]{100, 400, 600})).isFalse();

        SettingsService settings = mock(SettingsService.class);
        NovaPoshtaWarehouse small = new NovaPoshtaWarehouse();
        small.setMaxWeightKg(15);
        small.setMaxLengthMm(300);
        small.setMaxWidthMm(200);
        small.setMaxHeightMm(100);
        assertThat(PostomatLimits.maxKg(small, settings)).isEqualTo(15);
        assertThat(PostomatLimits.takes(small, box, settings)).isFalse();
        assertThat(PostomatLimits.takes(new NovaPoshtaWarehouse(), box, settings)).isTrue();
        Parcel heavy = new Parcel(25_000, 350, 250, 120, "t");
        assertThat(PostomatLimits.takes(new NovaPoshtaWarehouse(), heavy, settings)).isFalse();
    }

    @Test
    void documentsAreTheirOwnCargoType() {
        Parcel flat = new Parcel(300, 300, 250, 10, "t");
        assertThat(flat.documents()).isFalse();
        assertThat(flat.cargoType()).isEqualTo("Parcel");
        Parcel doc = flat.withDocuments(true);
        assertThat(doc.cargoType()).isEqualTo("Documents");
        assertThat(doc.source()).contains("Документи");
        assertThat(doc.withDocuments(false).cargoType()).isEqualTo("Parcel");
    }

    private static OrderShipment api(ShipmentStage stage, long cod) {
        OrderShipment s = new OrderShipment();
        s.setTtn("20450000000000");
        s.setOrigin(OrderShipment.ORIGIN_API);
        s.setStage(stage.name());
        s.setCodMinor(cod);
        s.setCollectCod(cod > 0);
        s.setCreatedAt(NOW.minus(Duration.ofHours(3)));
        return s;
    }

    /** An NP order to a branch; {@code codMinor} = what is still owed on pickup. */
    private static ShippingOrder order(OrderStatus status, long codMinor, String warehouseRef,
                                       List<ShippingOrder.Line> lines) {
        return new ShippingOrder(new byte[16], "00000000", status, DeliveryMethod.NOVA_POSHTA,
                NpServiceType.WAREHOUSE, "city", "Харків", warehouseRef, "Відділення №1", null, null, null, null,
                "Петренко Іван", null, null, null, "+380991090362", codMinor > 0, 2080_00, codMinor, codMinor == 0,
                0, false,
                false, false, null, NOW, null, lines, "");
    }

    private static ShippingOrder order(OrderStatus status, long codMinor) {
        return order(status, codMinor, "wh-1", List.of(line(P1, 0)));
    }

    private static ShippingOrder.Line line(String productId, int returned) {
        return new ShippingOrder.Line(productId, null, "Товар", null, 1, returned, 1000_00, false);
    }

    @Test
    void inboxShowsMoneyAndOrderMismatches() {
        // COD on the waybill is what the order still owes: fine.
        assertThat(ParcelIssues.reason(api(ShipmentStage.CREATED, 900_00), order(OrderStatus.APPROVED, 900_00),
                NOW, LIMITS)).isNull();
        // Paid in full after the waybill was made, the waybill still collects: not sent yet = stale, remake it.
        ParcelIssues.Reason stale = ParcelIssues.reason(api(ShipmentStage.CREATED, 900_00),
                order(OrderStatus.APPROVED, 0), NOW, LIMITS);
        assertThat(stale.kind()).isEqualTo("STALE");
        assertThat(stale.urgent()).isTrue();
        // ...already at NP: only NP's cabinet can change the sum.
        ParcelIssues.Reason drift = ParcelIssues.reason(api(ShipmentStage.IN_TRANSIT, 900_00),
                order(OrderStatus.SHIPPED, 0), NOW, LIMITS);
        assertThat(drift.kind()).isEqualTo("COD_DRIFT");
        // Rejected, but NP already has the parcel: the return wizard.
        ParcelIssues.Reason atNp = ParcelIssues.reason(api(ShipmentStage.IN_TRANSIT, 0),
                order(OrderStatus.REJECTED, 0), NOW, LIMITS);
        assertThat(atNp.kind()).isEqualTo("REJECTED_AT_NP");
        assertThat(atNp.text()).contains("Возврат");
        // Deleted at NP while the order lives on.
        assertThat(ParcelIssues.reason(api(ShipmentStage.CANCELLED, 0), order(OrderStatus.APPROVED, 0),
                NOW, LIMITS).kind()).isEqualTo("CANCELLED");
        assertThat(ParcelIssues.reason(api(ShipmentStage.CANCELLED, 0), order(OrderStatus.REJECTED, 0),
                NOW, LIMITS)).isNull();
        // Picked up, the order did not follow.
        assertThat(ParcelIssues.reason(api(ShipmentStage.RECEIVED, 0), order(OrderStatus.SHIPPED, 0),
                NOW, LIMITS).kind()).isEqualTo("RECEIVED_SHIPPED");
        // Too old to be polled.
        OrderShipment old = api(ShipmentStage.IN_TRANSIT, 0);
        old.setCreatedAt(NOW.minus(Duration.ofDays(61)));
        assertThat(ParcelIssues.reason(old, order(OrderStatus.SHIPPED, 0), NOW, LIMITS).kind())
                .isEqualTo("TRACKING_STOPPED");
        // Not handed over within the setting (2 days).
        OrderShipment idle = api(ShipmentStage.CREATED, 0);
        idle.setCreatedAt(NOW.minus(Duration.ofDays(3)));
        assertThat(ParcelIssues.reason(idle, order(OrderStatus.APPROVED, 0), NOW, LIMITS).text())
                .contains("не сдали");
    }

    /** Owner's test 2026-10-24: gifts added after the label was printed, nothing showed it. */
    @Test
    void aWaybillGoesStaleWhenTheOrderChangesAfterIt() {
        List<ShippingOrder.Line> lines = new ArrayList<>(List.of(line(P1, 0)));
        ShippingOrder o = order(OrderStatus.APPROVED, 1980_00, "wh-1", lines);
        OrderShipment s = api(ShipmentStage.CREATED, 1980_00);
        s.setActive(true);
        s.setGoodsKey(ShipmentFacts.goodsKey(o));
        s.setRecipientKey(ShipmentFacts.recipientKey(o));
        assertThat(ShipmentFacts.staleReasons(o, s)).isEmpty();

        // A gift: the money is the same, the parcel is not.
        ShippingOrder withGift = order(OrderStatus.APPROVED, 1980_00, "wh-1", List.of(line(P1, 0), line(GIFT, 0)));
        assertThat(ShipmentFacts.staleReasons(withGift, s)).singleElement().asString().contains("Состав");
        assertThat(ParcelIssues.reason(s, withGift, NOW, LIMITS).kind()).isEqualTo("STALE");
        // Returned again: the same goods as on the waybill.
        ShippingOrder giftBack = order(OrderStatus.APPROVED, 1980_00, "wh-1", List.of(line(P1, 0), line(GIFT, 1)));
        assertThat(ShipmentFacts.staleReasons(giftBack, s)).isEmpty();

        ShippingOrder moved = order(OrderStatus.APPROVED, 1980_00, "wh-2", lines);
        assertThat(ShipmentFacts.staleReasons(moved, s)).singleElement().asString().contains("адрес");

        // A failed automatic update stays until the waybill is made again (the poll does not clear it).
        s.setSyncError("ТТН не обновилась после правки заказа: Новая почта не отвечает");
        s.setPollError(null);
        assertThat(ShipmentFacts.staleReasons(o, s)).singleElement().asString().contains("не обновилась");

        // Handed over: NP has the parcel, nothing to remake.
        s.setStage(ShipmentStage.IN_TRANSIT.name());
        assertThat(ShipmentFacts.staleReasons(o, s)).isEmpty();
        // Older waybills without fingerprints: money only.
        OrderShipment older = api(ShipmentStage.CREATED, 1980_00);
        older.setActive(true);
        assertThat(ShipmentFacts.staleReasons(withGift, older)).isEmpty();
    }

    /** The real waybill of 2026-10-24: 1980 ₴ collected → «Комісія за контроль оплати» 59.60 ₴. */
    @Test
    void transferFeeIsTwoPercentPlusTwentyAndOnlyWhenSomethingIsCollected() {
        SettingsService settings = mock(SettingsService.class);
        when(settings.getInt(DeliverySettings.NP_COD_FEE_PCT)).thenReturn(2);
        when(settings.getInt(DeliverySettings.NP_COD_FEE_FIXED)).thenReturn(20);
        NovaPoshtaPriceService prices = new NovaPoshtaPriceService(null, null, settings, null);
        assertThat(prices.codFee(1980_00)).isEqualTo(59_60L);
        assertThat(prices.codFee(0)).isZero();
        NovaPoshtaPriceService.Estimate e = new NovaPoshtaPriceService.Estimate(100_40, 59_60L);
        assertThat(e.totalMinor()).isEqualTo(160_00);
        assertThat(new NovaPoshtaPriceService.Estimate(100_40, null).totalMinor()).isEqualTo(100_40);
    }

    @Test
    void npRefusingAPrintedWaybillIsRecognised() {
        assertThat(NpWaybillWriter.printedAtNp(NovaPoshtaException.rejected("Document is already printed"))).isTrue();
        assertThat(NpWaybillWriter.printedAtNp(NovaPoshtaException.rejected("Recipient is invalid"))).isFalse();
    }

    @Test
    void aTypedInParcelOfSomeoneElseIsShown() {
        OrderShipment s = api(ShipmentStage.IN_TRANSIT, 0);
        s.setOrigin(OrderShipment.ORIGIN_MANUAL);
        s.setPollError(ShipmentStatusApplier.FOREIGN_PARCEL + " — проверьте");
        assertThat(ParcelIssues.reason(s, order(OrderStatus.APPROVED, 0), NOW, LIMITS).kind()).isEqualTo("FOREIGN");
    }
}
