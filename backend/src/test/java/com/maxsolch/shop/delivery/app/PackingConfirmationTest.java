package com.maxsolch.shop.delivery.app;

import com.maxsolch.shop.audit.app.AdminAuditService;
import com.maxsolch.shop.delivery.app.PackingCommands.ConfirmBox;
import com.maxsolch.shop.delivery.app.PackingCommands.Confirmed;
import com.maxsolch.shop.delivery.app.PackingCommands.CustomBox;
import com.maxsolch.shop.delivery.app.ShipmentCommands.Options;
import com.maxsolch.shop.delivery.domain.BoxOptions;
import com.maxsolch.shop.delivery.domain.DeliveryError;
import com.maxsolch.shop.delivery.domain.NpBox;
import com.maxsolch.shop.delivery.domain.OrderShipment;
import com.maxsolch.shop.delivery.domain.PackingMemoryEntry;
import com.maxsolch.shop.delivery.domain.ParcelPacking.Unit;
import com.maxsolch.shop.delivery.domain.ShipmentStage;
import com.maxsolch.shop.delivery.infra.OrderShipmentRepository;
import com.maxsolch.shop.delivery.infra.PackingMemoryStore;
import com.maxsolch.shop.order.app.ShipmentOrders;
import com.maxsolch.shop.order.app.ShippingOrder;
import com.maxsolch.shop.order.domain.OrderStatus;
import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.platform.jobs.InMemoryLockProvider;
import com.maxsolch.shop.platform.security.AdminDirectory;
import com.maxsolch.shop.platform.util.UuidUtil;
import com.maxsolch.shop.platform.web.CurrentActor;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.function.Consumer;

import static com.maxsolch.shop.delivery.app.NpFixtures.ORDER;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/**
 * «Подтвердить коробку»: under the order's waybill lock, the NP update only while NP has no parcel, a printed label
 * remade with a new number, the box always recorded on the row and remembered for these goods.
 */
class PackingConfirmationTest {

    private static final Instant NOW = Instant.parse("2026-11-12T06:00:00Z");
    private static final String ORDER_ID = UuidUtil.toString(ORDER);
    private static final Unit KEYBOARD = new Unit(1300, 380, 150, 50, true);

    private final ShipmentLocks locks = NpFixtures.locks(new InMemoryLockProvider());
    private final OrderShipmentRepository shipments = mock(OrderShipmentRepository.class);
    private final ShipmentOrders orders = mock(ShipmentOrders.class);
    private final ShipmentEditing editing = mock(ShipmentEditing.class);
    private final ShipmentCreation creation = mock(ShipmentCreation.class);
    private final ShipmentStore store = mock(ShipmentStore.class);
    private final NpBoxCatalog catalog = mock(NpBoxCatalog.class);
    private final ParcelSizeService parcels = mock(ParcelSizeService.class);
    private final PackingMemoryStore memory = mock(PackingMemoryStore.class);
    private final AdminAuditService audit = mock(AdminAuditService.class);
    private final PostomatCells postomats = mock(PostomatCells.class);
    private final PackingConfirmation confirmation = new PackingConfirmation(locks, shipments, orders, editing,
            creation, store, catalog, parcels, memory, mock(CurrentActor.class), mock(AdminDirectory.class), audit, postomats,
            Clock.fixed(NOW, ZoneOffset.UTC));

    private final List<OrderShipment> rows = new ArrayList<>();
    private final NpBox np5 = box();
    private final ShippingOrder order = NpFixtures.order(OrderStatus.APPROVED, false, NpFixtures.TTN);
    private OrderShipment row;

    private static NpBox box() {
        NpBox b = new NpBox();
        b.setId(UuidUtil.randomBytes());
        b.setCode("np-5");
        b.setName("Коробка 5 кг");
        b.setKind(NpBox.KIND_BOX);
        b.setLengthMm(400);
        b.setWidthMm(240);
        b.setHeightsMm("200,130,80");
        b.setTareG(200);
        return b;
    }

    @BeforeEach
    void setUp() {
        row = add(NpFixtures.api(ShipmentStage.CREATED));
        row.setBoxSuggested("Коробка 5 кг · 13 см");
        row.setBoxSuggestedSource(BoxSuggestion.BY_SIZE);
        row.setGoodsKey(ShipmentFacts.goodsKey(order));
        row.setRecipientKey(ShipmentFacts.current(order).recipientKey());
        when(orders.find(ORDER)).thenReturn(Optional.of(order));
        when(shipments.findFirstByOrderIdAndActiveTrueOrderByCreatedAtDesc(ORDER)).thenReturn(Optional.of(row));
        when(shipments.findById(any())).thenAnswer(i -> find(i.getArgument(0)));
        when(parcels.units(order)).thenReturn(List.of(KEYBOARD));
        when(catalog.find(any())).thenAnswer(i -> java.util.Arrays.equals(i.getArgument(0), np5.getId())
                ? Optional.of(np5) : Optional.empty());
        doAnswer(i -> {
            Consumer<OrderShipment> how = i.getArgument(1);
            find(i.getArgument(0)).ifPresent(how);
            return null;
        }).when(store).change(any(), any());
        when(editing.updateHeld(eq(ORDER), any())).thenAnswer(i -> {
            // The update runs while «np-ttn:<order>» is held: a second taker is turned away.
            assertThatThrownBy(() -> locks.withOrder(ORDER, () -> null)).isInstanceOf(DomainException.class);
            return row;
        });
    }

    private OrderShipment add(OrderShipment s) {
        rows.add(s);
        return s;
    }

    private Optional<OrderShipment> find(byte[] id) {
        return rows.stream().filter(s -> java.util.Arrays.equals(s.getId(), id)).reduce((a, b) -> b);
    }

    private static ConfirmBox catalogBox(NpBox b, Integer heightMm) {
        return new ConfirmBox(UuidUtil.toString(b.getId()), heightMm, null, null, null);
    }

    @Test
    void beforeHandoverTheWaybillIsUpdatedOnceUnderTheLock() {
        Confirmed done = confirmation.confirm(ORDER_ID, catalogBox(np5, 80));

        ArgumentCaptor<Options> o = ArgumentCaptor.forClass(Options.class);
        verify(editing, times(1)).updateHeld(eq(ORDER), o.capture());
        assertThat(o.getValue().lengthMm()).isEqualTo(400);
        assertThat(o.getValue().widthMm()).isEqualTo(240);
        assertThat(o.getValue().heightMm()).isEqualTo(80);
        assertThat(o.getValue().weightG()).isEqualTo(1300 + 200);
        assertThat(done.ttnUpdated()).isTrue();
        assertThat(done.ttnNumberChanged()).isFalse();
        assertThat(row.getBoxLabel()).isEqualTo("Коробка 5 кг · 8 см");
        assertThat(row.getBoxHeightMm()).isEqualTo(80);
        assertThat(row.getBoxId()).isEqualTo(np5.getId());
        assertThat(row.getBoxConfirmedAt()).isEqualTo(NOW);
        assertThat(done.shipment().packing().boxLabel()).isEqualTo("Коробка 5 кг · 8 см");
        assertThat(done.shipment().packing().unconfirmed()).isFalse();
        verify(audit).record(eq("NP_BOX_CONFIRM"), eq("ORDER"), eq(ORDER_ID), anyString());
    }

    private NpBox npBag() {
        NpBox b = new NpBox();
        b.setId(UuidUtil.randomBytes());
        b.setName("Пакет НП");
        b.setKind(NpBox.KIND_BAG);
        b.setLengthMm(550);
        b.setWidthMm(500);
        b.setTareG(50);
        when(catalog.find(any())).thenAnswer(i -> java.util.Arrays.equals(i.getArgument(0), b.getId())
                ? Optional.of(b) : Optional.empty());
        return b;
    }

    @Test
    void aBagIntoAParcelLockerIsFoldedToTheCell() {
        // «Пакет НП» 55×50 cm into a 60×40×30 locker was refused as «больше 60×40×30» (#5e9f3f1a, 13.11.2026).
        NpBox bag = npBag();
        when(postomats.cell(row.getServiceType(), order)).thenReturn(new int[] {300, 400, 600});

        Confirmed done = confirmation.confirm(ORDER_ID, catalogBox(bag, null));

        ArgumentCaptor<Options> o = ArgumentCaptor.forClass(Options.class);
        verify(editing).updateHeld(eq(ORDER), o.capture());
        assertThat(o.getValue().lengthMm()).isEqualTo(550);
        assertThat(o.getValue().widthMm()).isEqualTo(400);
        assertThat(o.getValue().heightMm()).isEqualTo(50);
        assertThat(done.shipment().packing().boxLabel()).isEqualTo("Пакет НП · сложить до 55×40 см");
    }

    @Test
    void aBagToABranchKeepsItsSides() {
        NpBox bag = npBag();

        confirmation.confirm(ORDER_ID, catalogBox(bag, null));

        ArgumentCaptor<Options> o = ArgumentCaptor.forClass(Options.class);
        verify(editing).updateHeld(eq(ORDER), o.capture());
        assertThat(o.getValue().widthMm()).isEqualTo(500);
        assertThat(row.getBoxLabel()).isEqualTo("Пакет НП");
    }

    @Test
    void aPrintedLabelIsRemadeWithANewNumber() {
        row.setPrintedAt(NOW.minusSeconds(60));
        OrderShipment remade = NpFixtures.shipment(OrderShipment.ORIGIN_API, ShipmentStage.CREATED, "20450000000002");
        remade.setId(new byte[] {7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7});
        add(remade);
        when(editing.updateHeld(eq(ORDER), any())).thenReturn(remade);

        Confirmed done = confirmation.confirm(ORDER_ID, catalogBox(np5, 130));

        assertThat(done.ttnNumberChanged()).isTrue();
        assertThat(done.shipment().ttn()).isEqualTo("20450000000002");
        assertThat(remade.getBoxLabel()).isEqualTo("Коробка 5 кг · 13 см");
        assertThat(remade.getBoxSuggested()).isEqualTo("Коробка 5 кг · 13 см");
        assertThat(row.getBoxLabel()).isNull();
    }

    @Test
    void afterHandoverNothingGoesToNpAndTheBoxIsOnlyRecorded() {
        row.setStage(ShipmentStage.IN_TRANSIT.name());
        row.setStatusCode("5");

        Confirmed done = confirmation.confirm(ORDER_ID, catalogBox(np5, null));

        verify(editing, never()).updateHeld(any(), any());
        assertThat(done.ttnUpdated()).isFalse();
        assertThat(row.getBoxLabel()).isEqualTo("Коробка 5 кг");
        assertThat(row.getBoxHeightMm()).isEqualTo(200);
    }

    @Test
    void theBoxIsRememberedForTheseGoodsOncePerOrder() {
        confirmation.confirm(ORDER_ID, catalogBox(np5, 80));
        confirmation.confirm(ORDER_ID, catalogBox(np5, 80)); // a double tap / the weight added later

        ArgumentCaptor<PackingMemoryEntry> e = ArgumentCaptor.forClass(PackingMemoryEntry.class);
        verify(memory, times(1)).remember(e.capture(), eq(NOW));
        assertThat(e.getValue().goodsSig()).isEqualTo(ShipmentFacts.goodsKey(order));
        assertThat(e.getValue().boxKey()).isEqualTo(PackingMemoryEntry.boxKey(UuidUtil.toString(np5.getId()), 80));
        assertThat(e.getValue().heightMm()).isEqualTo(80);
    }

    @Test
    void anotherBoxForTheSameOrderIsRememberedToo() {
        confirmation.confirm(ORDER_ID, catalogBox(np5, 80));
        confirmation.confirm(ORDER_ID, catalogBox(np5, 130));

        verify(memory, times(2)).remember(any(), eq(NOW));
    }

    @Test
    void thePrintedWaybillWithThisVeryBoxIsNotRemade() {
        row.setPrintedAt(NOW.minusSeconds(60));
        row.setLengthMm(400);
        row.setWidthMm(240);
        row.setHeightMm(130);
        row.setWeightG(1300 + 200);

        Confirmed done = confirmation.confirm(ORDER_ID, catalogBox(np5, 130));

        verify(editing, never()).updateHeld(any(), any());
        assertThat(done.ttnUpdated()).isFalse();
        assertThat(done.ttnNumberChanged()).isFalse();
        assertThat(row.getBoxLabel()).isEqualTo("Коробка 5 кг · 13 см");
    }

    @Test
    void typedInSidesCanBeSavedAsOurOwnBox() {
        NpBox own = box();
        own.setCode(null);
        own.setName("Короб от клавиатуры");
        own.setLengthMm(450);
        own.setWidthMm(150);
        own.setHeightsMm("50");
        own.setTareG(0);
        when(catalog.saveOwn("Короб от клавиатуры", 450, 150, 50)).thenReturn(own);

        confirmation.confirm(ORDER_ID, new ConfirmBox(null, null,
                new CustomBox("Короб от клавиатуры", 450, 150, 50, true), 1400, null));

        verify(catalog).saveOwn("Короб от клавиатуры", 450, 150, 50);
        assertThat(row.getBoxLabel()).isEqualTo("Короб от клавиатуры");
        assertThat(row.getBoxId()).isEqualTo(own.getId());
        verify(memory).remember(any(), any());
    }

    @Test
    void typedInSidesWithoutSavingGetAPlainLabel() {
        confirmation.confirm(ORDER_ID, new ConfirmBox(null, null, new CustomBox(null, 400, 240, 95, false), null,
                null));
        verify(catalog, never()).saveOwn(anyString(), anyInt(), anyInt(), anyInt());
        assertThat(row.getBoxLabel()).isEqualTo("Своя коробка 40×24×9,5 см");
        assertThat(row.getBoxId()).isNull();
        ArgumentCaptor<PackingMemoryEntry> e = ArgumentCaptor.forClass(PackingMemoryEntry.class);
        verify(memory).remember(e.capture(), any());
        assertThat(e.getValue().boxKey()).isEqualTo("custom:400x240x95");
    }

    @Test
    void aBoxOnlyChangeDoesNotMakeTheWaybillStale() {
        // CREATED: the stage the fingerprints are checked at, and the NP update runs.
        assertThat(com.maxsolch.shop.delivery.domain.ShipmentStaleness.applies(row)).isTrue();
        confirmation.confirm(ORDER_ID, catalogBox(np5, 130));
        assertThat(ShipmentFacts.staleReasons(order, row)).isEmpty();
        assertThat(ShipmentFacts.brief(row, order).staleReasons()).isNullOrEmpty();
    }

    @Test
    void aNewOrderIsNotPackedIntoAWaybill() {
        when(orders.find(ORDER)).thenReturn(Optional.of(NpFixtures.order(OrderStatus.NEW, false, null)));
        when(shipments.findFirstByOrderIdAndActiveTrueOrderByCreatedAtDesc(ORDER)).thenReturn(Optional.empty());
        assertThatThrownBy(() -> confirmation.confirm(ORDER_ID, catalogBox(np5, 80)))
                .isInstanceOf(DomainException.Conflict.class);
        verifyNoInteractions(creation);
    }

    @Test
    void aNumberTypedByHandWithoutItsRowYetMakesNoSecondWaybill() {
        when(shipments.findFirstByOrderIdAndActiveTrueOrderByCreatedAtDesc(ORDER)).thenReturn(Optional.empty());
        assertThatThrownBy(() -> confirmation.confirm(ORDER_ID, catalogBox(np5, 80)))
                .isInstanceOf(DomainException.Conflict.class)
                .satisfies(e -> assertThat(((DomainException) e).getCode()).isEqualTo(DeliveryError.NP_BOX_NO_TTN.code()));
        verifyNoInteractions(creation);
        verify(memory, never()).remember(any(), any());
    }

    @Test
    void withoutAWaybillPackingMakesItWithThisBox() {
        // v3.67.0: packed first, then the waybill — its label is printed after the packing (Maxim printed labels of
        // waybills made on approve from the NP cabinet before packing, 13.11.2026).
        when(orders.find(ORDER)).thenReturn(Optional.of(NpFixtures.order(OrderStatus.APPROVED, false, null)));
        when(shipments.findFirstByOrderIdAndActiveTrueOrderByCreatedAtDesc(ORDER)).thenReturn(Optional.empty());
        when(creation.createHeld(eq(ORDER), any())).thenAnswer(i -> {
            // Made under the order's lock «np-ttn:<order>», which is not re-entrant.
            assertThatThrownBy(() -> locks.withOrder(ORDER, () -> null)).isInstanceOf(DomainException.class);
            return row;
        });

        Confirmed done = confirmation.confirm(ORDER_ID, catalogBox(np5, 80));

        ArgumentCaptor<Options> o = ArgumentCaptor.forClass(Options.class);
        verify(creation).createHeld(eq(ORDER), o.capture());
        assertThat(o.getValue().lengthMm()).isEqualTo(400);
        assertThat(o.getValue().widthMm()).isEqualTo(240);
        assertThat(o.getValue().heightMm()).isEqualTo(80);
        assertThat(o.getValue().documents()).isNull();
        verify(editing, never()).updateHeld(any(), any());
        assertThat(done.ttnCreated()).isTrue();
        assertThat(done.ttnNumberChanged()).isFalse();
        assertThat(row.getBoxLabel()).startsWith("Коробка 5 кг");
        verify(memory).remember(any(), any());
    }

    @Test
    void aHeightTheBoxDoesNotFoldToIsRefused() {
        assertThatThrownBy(() -> confirmation.confirm(ORDER_ID, catalogBox(np5, 100)))
                .isInstanceOf(DomainException.class);
        verify(editing, never()).updateHeld(any(), any());
        assertThat(BoxOptions.allows(np5, 100)).isFalse();
    }
}
