package com.maxsolch.shop.delivery.app;

import com.maxsolch.shop.order.app.ShipmentOrders;
import com.maxsolch.shop.order.domain.DeliveryMethod;
import com.maxsolch.shop.order.domain.OrderEvents;
import com.maxsolch.shop.order.domain.OrderEvents.EditKind;
import com.maxsolch.shop.order.domain.OrderStatus;
import com.maxsolch.shop.platform.jobs.Workers;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;

import java.util.Optional;

import static com.maxsolch.shop.delivery.app.NpFixtures.ORDER;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/** Which order event does what to its waybill (the work itself runs on the calling thread here). */
class ShipmentOrderListenerTest {

    private static final byte[] TARGET = new byte[] {7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7};

    private final ShipmentOrders orders = mock(ShipmentOrders.class);
    private final ShipmentManualSync manual = mock(ShipmentManualSync.class);
    private final ShipmentBatch batch = mock(ShipmentBatch.class);
    private final ShipmentCancellation cancellation = mock(ShipmentCancellation.class);
    private final ShipmentEditing editing = mock(ShipmentEditing.class);
    private ShipmentOrderListener listener;

    @BeforeEach
    void setUp() {
        Workers workers = mock(Workers.class);
        when(workers.single(anyString())).thenReturn(new NpFixtures.DirectExecutor());
        listener = new ShipmentOrderListener(orders, manual, batch, cancellation, editing, workers);
    }

    private void order(OrderStatus status, String tracking, DeliveryMethod method) {
        when(orders.find(ORDER)).thenReturn(Optional.of(NpFixtures.order(status, false, tracking, method)));
    }

    @Test
    void rejectedOrderDropsItsWaybill() {
        order(OrderStatus.REJECTED, "20450000000001", DeliveryMethod.NOVA_POSHTA);
        listener.onStatus(new OrderEvents.StatusChanged(ORDER));
        verify(manual).sync(ORDER);
        verify(cancellation).dropForClosedOrder(ORDER);
        verifyNoInteractions(batch);
    }

    @Test
    void approvedNpOrderGetsTheAutomaticWaybill() {
        order(OrderStatus.APPROVED, null, DeliveryMethod.NOVA_POSHTA);
        listener.onStatus(new OrderEvents.StatusChanged(ORDER));
        verify(batch).autoCreate(ORDER);
        verify(cancellation, never()).dropForClosedOrder(any());
    }

    @Test
    void approvedPickupOrderGetsNoWaybill() {
        order(OrderStatus.APPROVED, null, DeliveryMethod.PICKUP);
        listener.onStatus(new OrderEvents.StatusChanged(ORDER));
        verifyNoInteractions(batch, cancellation);
    }

    @Test
    void shippedOrDeliveredOnlySyncTheTypedNumber() {
        order(OrderStatus.SHIPPED, "20450000000001", DeliveryMethod.NOVA_POSHTA);
        listener.onStatus(new OrderEvents.StatusChanged(ORDER));
        verify(manual).sync(ORDER);
        verifyNoInteractions(batch, cancellation, editing);
    }

    @Test
    void aTypedTrackingNumberIsSyncedOnly() {
        listener.onEdited(OrderEvents.Edited.of(ORDER, EditKind.TRACKING, true));
        verify(manual).sync(ORDER);
        verifyNoInteractions(editing, cancellation, batch);
    }

    @ParameterizedTest
    @EnumSource(value = EditKind.class, names = {"COMPOSITION", "GIFT", "DISCOUNT", "SILENT", "DETAILS"})
    void anEditKeepsTheWaybillInStep(EditKind kind) {
        listener.onEdited(OrderEvents.Edited.of(ORDER, kind, false));
        verify(editing).syncWithOrder(ORDER);
        verifyNoInteractions(manual, cancellation, batch);
    }

    @Test
    void aGiftCaseDoesNotTouchTheWaybill() {
        listener.onEdited(OrderEvents.Edited.of(ORDER, EditKind.GIFT_CASE, true));
        verifyNoInteractions(editing, manual, cancellation, batch);
    }

    @Test
    void aPaymentUpdatesTheMoneyOnTheWaybill() {
        listener.onPayment(new OrderEvents.PaymentReceived(ORDER, 100_00));
        verify(editing).syncWithOrder(ORDER);
    }

    @Test
    void anExchangeThatClearedTheNumberDropsTheWaybill() {
        order(OrderStatus.APPROVED, null, DeliveryMethod.NOVA_POSHTA);
        listener.onExchanged(new OrderEvents.Exchanged(ORDER, false, null));
        verify(manual).sync(ORDER);
        verify(cancellation).dropForClosedOrder(ORDER);
    }

    @Test
    void anExchangeThatKeptTheNumberKeepsTheWaybill() {
        order(OrderStatus.SHIPPED, "20450000000001", DeliveryMethod.NOVA_POSHTA);
        listener.onExchanged(new OrderEvents.Exchanged(ORDER, false, null));
        verify(manual).sync(ORDER);
        verify(cancellation, never()).dropForClosedOrder(any());
    }

    @Test
    void archivingDropsTheWaybill() {
        listener.onArchived(new OrderEvents.Archived(ORDER));
        verify(cancellation).dropForClosedOrder(ORDER);
    }

    @Test
    void aMergeDropsTheSourceWaybillAndUpdatesTheTarget() {
        listener.onMerged(new OrderEvents.Merged(TARGET, ORDER, false));
        verify(cancellation).dropForClosedOrder(ORDER);
        verify(editing).syncWithOrder(TARGET);
        verify(cancellation, never()).dropForClosedOrder(TARGET);
    }

    @Test
    void aFailureOfOneEventDoesNotStopTheNext() {
        doThrow(new IllegalStateException("boom")).when(cancellation).dropForClosedOrder(ORDER);
        listener.onArchived(new OrderEvents.Archived(ORDER));
        listener.onPayment(new OrderEvents.PaymentReceived(ORDER, 1));
        verify(editing).syncWithOrder(ORDER);
    }
}
