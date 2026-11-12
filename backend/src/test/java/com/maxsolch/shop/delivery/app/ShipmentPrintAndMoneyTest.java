package com.maxsolch.shop.delivery.app;

import com.maxsolch.shop.delivery.app.ShipmentCommands.Options;
import com.maxsolch.shop.delivery.domain.NovaPoshtaGateway;
import com.maxsolch.shop.delivery.domain.OrderShipment;
import com.maxsolch.shop.delivery.domain.Parcel;
import com.maxsolch.shop.delivery.domain.ShipmentStage;
import com.maxsolch.shop.delivery.infra.NovaPoshtaWarehouseRepository;
import com.maxsolch.shop.delivery.infra.OrderShipmentRepository;
import com.maxsolch.shop.order.app.ShipmentOrders;
import com.maxsolch.shop.order.app.ShippingOrder;
import com.maxsolch.shop.platform.jobs.InMemoryLockProvider;
import com.maxsolch.shop.platform.time.ShopZone;
import com.maxsolch.shop.settings.app.SettingsService;
import org.junit.jupiter.api.Test;
import org.springframework.orm.ObjectOptimisticLockingFailureException;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;

import static com.maxsolch.shop.delivery.app.NpFixtures.ORDER;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** {@code printed_at} survives an update racing a print; «не оплачено» follows the order module's money rule. */
class ShipmentPrintAndMoneyTest {

    private static final Instant PRINTED = Instant.parse("2026-11-12T07:55:00Z");
    private static final Clock CLOCK = Clock.fixed(NpFixtures.now(), ZoneOffset.UTC);

    private final OrderShipmentRepository shipments = mock(OrderShipmentRepository.class);
    private final ShipmentStore store = new ShipmentStore(shipments, mock(ShipmentOrders.class),
            mock(NpWaybillWriter.class), new NpFixtures.DirectTx(), CLOCK);

    // --- 2c

    @Test
    void aPrintRecordedWhileNpTookTheUpdateIsKept() {
        OrderShipment row = NpFixtures.api(ShipmentStage.CREATED);
        row.setPrintedAt(PRINTED);
        when(shipments.findById(row.getId())).thenReturn(Optional.of(row));

        OrderShipment saved = store.refill(row.getId(), NpFixtures.prepared(null), NpFixtures.result(), null);

        assertThat(saved.getPrintedAt()).isEqualTo(PRINTED);
    }

    @Test
    void anUpdateOfAnUnprintedWaybillLeavesItUnprinted() {
        OrderShipment row = NpFixtures.api(ShipmentStage.CREATED);
        when(shipments.findById(row.getId())).thenReturn(Optional.of(row));

        assertThat(store.refill(row.getId(), NpFixtures.prepared(null), NpFixtures.result(), null).getPrintedAt())
                .isNull();
    }

    @Test
    void aPrintThatLostTheVersionRaceIsWrittenAgainOnTheFreshRow() {
        OrderShipment fresh = NpFixtures.api(ShipmentStage.IN_TRANSIT);
        when(shipments.findById(fresh.getId()))
                .thenThrow(new ObjectOptimisticLockingFailureException(OrderShipment.class, fresh.getId()))
                .thenReturn(Optional.of(fresh));

        store.markPrinted(List.of(fresh.getId()));

        assertThat(fresh.getPrintedAt()).isEqualTo(NpFixtures.now());
    }

    @Test
    void theAutomaticUpdateLeavesAWaybillPrintedMeanwhileAlone() {
        ShipmentPreparation preparation = mock(ShipmentPreparation.class);
        NpWaybillWriter writer = mock(NpWaybillWriter.class);
        ShipmentStore mockStore = mock(ShipmentStore.class);
        OrderShipment printed = NpFixtures.api(ShipmentStage.CREATED);
        printed.setPrintedAt(PRINTED);
        when(preparation.prepare(eq(ORDER), any())).thenReturn(NpFixtures.prepared(printed));
        ShipmentEditing editing = new ShipmentEditing(preparation, writer, mockStore,
                NpFixtures.locks(new InMemoryLockProvider()), null, shipments, mock(ShipmentOrders.class),
                mock(SettingsService.class));

        assertThat(editing.update(ORDER, Options.defaults(), false)).isNull();

        verify(writer, never()).save(any(), any());
        verify(mockStore, never()).refill(any(), any(), any(), any());
        assertThat(printed.getPrintedAt()).isEqualTo(PRINTED);
    }

    // --- 3

    private static Prepared prepare(ShippingOrder order) {
        ShipmentOrders orders = mock(ShipmentOrders.class);
        when(orders.find(ORDER)).thenReturn(Optional.of(order));
        BoxSuggestion parcels = mock(BoxSuggestion.class);
        when(parcels.forOrder(any())).thenReturn(new BoxSuggestion.Suggested(new Parcel(1000, 200, 150, 100, "t"),
                "t", BoxSuggestion.BY_SIZE));
        NovaPoshtaSenderService sender = mock(NovaPoshtaSenderService.class);
        when(sender.get()).thenReturn(Optional.empty());
        ShipmentPreparation p = new ShipmentPreparation(mock(NovaPoshtaGateway.class), sender, parcels, orders,
                mock(OrderShipmentRepository.class), mock(NovaPoshtaWarehouseRepository.class),
                mock(SettingsService.class), new ShopZone("Europe/Kyiv"), CLOCK);
        return p.prepare(ORDER, Options.defaults());
    }

    @Test
    void aPrepaymentNotArrivedIsUnpaidForItsOwnSumNotTheCod() {
        // «paid» is set by an arrived prepayment elsewhere; here the 100 ₴ online part is still missing.
        Prepared p = prepare(NpFixtures.owing(true, 900_00, 100_00, true));
        assertThat(p.unpaid()).isTrue();
        assertThat(p.amountDueMinor()).isEqualTo(100_00);
    }

    @Test
    void aBalanceLeftForTheParcelToCollectIsNotUnpaid() {
        // Not «paid» in full, but nothing is due online any more: the waybill collects the rest.
        Prepared p = prepare(NpFixtures.owing(false, 900_00, 0, false));
        assertThat(p.unpaid()).isFalse();
        assertThat(p.amountDueMinor()).isZero();
    }

    @Test
    void aTopUpStillDueOnAPaidOrderIsUnpaid() {
        Prepared p = prepare(NpFixtures.owing(true, 300_00, 300_00, true));
        assertThat(p.unpaid()).isTrue();
        assertThat(p.amountDueMinor()).isEqualTo(300_00);
    }
}
