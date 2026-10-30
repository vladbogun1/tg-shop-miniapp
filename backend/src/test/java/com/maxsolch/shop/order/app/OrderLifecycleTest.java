package com.maxsolch.shop.order.app;

import com.maxsolch.shop.order.domain.OrderEvents;

import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.order.domain.OrderStates;
import com.maxsolch.shop.order.domain.OrderMoney;
import com.maxsolch.shop.platform.util.UuidUtil;
import com.maxsolch.shop.order.domain.Order;
import com.maxsolch.shop.order.domain.OrderItem;
import com.maxsolch.shop.order.domain.OrderStatus;
import com.maxsolch.shop.catalog.domain.Product;
import com.maxsolch.shop.catalog.domain.ProductVariant;
import com.maxsolch.shop.order.domain.RejectReasonCode;
import jakarta.persistence.LockModeType;
import org.junit.jupiter.api.Test;
import org.mockito.InOrder;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** OrderLifecycle: approve, ship, deliver, reject, expire, the row locking of every change and the dispatch cards. */
class OrderLifecycleTest extends OrderScenarioTestBase {

    @Test
    void approve_thenShip_thenDeliver_setTimestamps() {
        Order o = persistedOrder(OrderStatus.NEW);
        when(orderRepository.findByIdForUpdate(o.getId())).thenReturn(Optional.of(o));

        Order approved = app.lifecycle().approve(o.getId());
        assertThat(approved.getStatus()).isEqualTo(OrderStatus.APPROVED);
        assertThat(approved.getApprovedAt()).isNotNull();

        Order shipped = app.lifecycle().ship(o.getId(), "TTN123");
        assertThat(shipped.getStatus()).isEqualTo(OrderStatus.SHIPPED);
        assertThat(shipped.getShippedAt()).isNotNull();
        assertThat(shipped.getTrackingNumber()).isEqualTo("TTN123");

        Order delivered = app.lifecycle().deliver(o.getId());
        assertThat(delivered.getStatus()).isEqualTo(OrderStatus.DELIVERED);
        assertThat(delivered.getDeliveredAt()).isNotNull();

        verify(events, times(3)).publish(any(OrderEvents.StatusChanged.class));
    }

    @Test
    void approve_nonNewOrder_throws() {
        Order o = persistedOrder(OrderStatus.SHIPPED);
        when(orderRepository.findByIdForUpdate(o.getId())).thenReturn(Optional.of(o));

        assertThatThrownBy(() -> app.lifecycle().approve(o.getId()))
                .isInstanceOf(DomainException.BadRequest.class)
                .hasMessageContaining("только новый");
    }

    @Test
    void deliver_nonShippedOrder_throws() {
        Order o = persistedOrder(OrderStatus.NEW);
        when(orderRepository.findByIdForUpdate(o.getId())).thenReturn(Optional.of(o));

        assertThatThrownBy(() -> app.lifecycle().deliver(o.getId()))
                .isInstanceOf(DomainException.BadRequest.class)
                .hasMessageContaining("только отправленный");
    }

    @Test
    void reject_restoresStockForProductAndVariant() {
        // order with one item referencing product+variant
        Order o = persistedOrder(OrderStatus.NEW);

        Product p = simpleProduct(1, 1_000);
        ProductVariant v = variant(p, 1);
        p.getVariants().add(v);

        OrderItem it = new OrderItem();
        it.setProductId(p.getId());
        it.setVariantId(v.getId());
        it.setQuantity(3);
        it.setTitleSnapshot("Test Product");
        o.getItems().add(it);

        when(orderRepository.findByIdForUpdate(o.getId())).thenReturn(Optional.of(o));
        when(productRepository.findByIdForUpdate(p.getId())).thenReturn(Optional.of(p));

        Order rejected = app.lifecycle().reject(o.getId(), "out of stock", true);

        assertThat(rejected.getStatus()).isEqualTo(OrderStatus.REJECTED);
        assertThat(rejected.getRejectedAt()).isNotNull();
        assertThat(rejected.getRejectReason()).isEqualTo("out of stock");
        assertThat(v.getStock()).isEqualTo(4); // 1 + 3 restored
        assertThat(p.getStock()).isEqualTo(4); // rollup = sum(variants)
        verify(productRepository).save(p);
    }

    @Test
    void reject_alreadyRejected_throws() {
        Order o = persistedOrder(OrderStatus.REJECTED);
        when(orderRepository.findByIdForUpdate(o.getId())).thenReturn(Optional.of(o));

        assertThatThrownBy(() -> app.lifecycle().reject(o.getId(), "x", true))
                .isInstanceOf(DomainException.BadRequest.class)
                .hasMessageContaining("уже отклонён");
    }

    @Test
    void reject_deliveredOrder_isRefused_useReturnInstead() {
        // Rejecting a delivered order kept its automatic «получено» — money that never was.
        Order o = persistedOrder(OrderStatus.DELIVERED);
        when(orderRepository.findByIdForUpdate(o.getId())).thenReturn(Optional.of(o));

        assertThatThrownBy(() -> app.lifecycle().reject(o.getId(), "возврат на НП", false))
                .isInstanceOf(DomainException.BadRequest.class)
                .hasMessageContaining("оформите «Возврат»");
        assertThat(o.getStatus()).isEqualTo(OrderStatus.DELIVERED);
    }

    @Test
    void reject_withReasonCode_storesCodeAndBlankTextAsNull() {
        Order o = persistedOrder(OrderStatus.NEW);
        when(orderRepository.findByIdForUpdate(o.getId())).thenReturn(Optional.of(o));

        Order rejected = app.lifecycle().reject(o.getId(), "  ", com.maxsolch.shop.order.domain.RejectReasonCode.NO_RESPONSE, false);

        assertThat(rejected.getRejectReasonCode()).isEqualTo("NO_RESPONSE");
        // Blank text must not reach the customer as an empty "Причина:".
        assertThat(rejected.getRejectReason()).isNull();
    }

    @Test
    void reject_afterPartialReturn_doesNotRestockReturnedUnitsTwice() {
        Order o = persistedOrder(OrderStatus.SHIPPED);
        Product p = simpleProduct(0, 1_000);
        OrderItem it = new OrderItem();
        it.setProductId(p.getId());
        it.setQuantity(3);
        it.setTitleSnapshot("Test Product");
        // One unit already came back and was put on the shelf by a partial return.
        it.setReturnedQty(1);
        it.setRestockedQty(1);
        o.getItems().add(it);
        when(orderRepository.findByIdForUpdate(o.getId())).thenReturn(Optional.of(o));
        when(productRepository.findByIdForUpdate(p.getId())).thenReturn(Optional.of(p));

        app.lifecycle().reject(o.getId(), "возврат", true);

        assertThat(p.getStock()).isEqualTo(2); // only the 2 units still out
        assertThat(it.getRestockedQty()).isEqualTo(3);
    }

    @Test
    void reject_afterReturnWithoutRestock_doesNotPutWrittenOffUnitsBack() {
        Order o = persistedOrder(OrderStatus.SHIPPED);
        Product p = simpleProduct(0, 1_000);
        OrderItem it = new OrderItem();
        it.setProductId(p.getId());
        it.setQuantity(3);
        it.setTitleSnapshot("Test Product");
        // One unit came back damaged: returned, but «на склад» was off — it is written off.
        it.setReturnedQty(1);
        it.setRestockedQty(0);
        o.getItems().add(it);
        when(orderRepository.findByIdForUpdate(o.getId())).thenReturn(Optional.of(o));
        when(productRepository.findByIdForUpdate(p.getId())).thenReturn(Optional.of(p));

        app.lifecycle().reject(o.getId(), "возврат", true);

        assertThat(p.getStock()).isEqualTo(2); // only the 2 units never returned
    }

    @Test
    void ship_withPendingCancelRequest_throws() {
        Order o = persistedOrder(OrderStatus.APPROVED);
        o.setCancelRequestStatus(com.maxsolch.shop.order.domain.CancelRequestStatus.PENDING.name());
        when(orderRepository.findByIdForUpdate(o.getId())).thenReturn(Optional.of(o));

        assertThatThrownBy(() -> app.lifecycle().ship(o.getId(), null))
                .isInstanceOf(DomainException.BadRequest.class)
                .hasMessageContaining("запрос отмены");
        assertThat(o.getStatus()).isEqualTo(OrderStatus.APPROVED);
    }

    @Test
    void ship_withoutTheOnlinePayment_needsTheAdminsConfirmation() {
        Order o = approvedPrepaymentNotPaid();
        when(orderRepository.findByIdForUpdate(o.getId())).thenReturn(Optional.of(o));

        assertThatThrownBy(() -> app.lifecycle().ship(o.getId(), "20450000000000"))
                .isInstanceOf(DomainException.BadRequest.class)
                .hasMessageContaining("Предоплата по заказу #")
                .hasMessageContaining("не пришла")
                .satisfies(e -> assertThat(((DomainException) e).getCode()).isEqualTo(Order.SHIP_UNPAID_CODE));
        assertThat(o.getStatus()).isEqualTo(OrderStatus.APPROVED);

        Order shipped = app.lifecycle().changeStatus(o.getId(), OrderStatus.SHIPPED, "20450000000000", null, null, true, true);
        assertThat(shipped.getStatus()).isEqualTo(OrderStatus.SHIPPED);
    }

    @Test
    void onlinePaymentMissing_onlyForOnlineOrdersWithMoneyStillDue() {
        Order o = approvedPrepaymentNotPaid();
        assertThat(OrderMoney.onlinePaymentMissing(o)).isTrue();
        o.setReceivedMinor(10_000); // the prepayment arrived; the rest is наложка
        assertThat(OrderMoney.onlinePaymentMissing(o)).isFalse();
        Order legacy = persistedOrder(OrderStatus.APPROVED);
        legacy.setTotalMinor(50_000); // before online payments: no deadline, nothing "missing"
        assertThat(OrderMoney.onlinePaymentMissing(legacy)).isFalse();
    }

    @Test
    void cancelByCustomer_setsChangedMindCode() {
        Order o = persistedOrder(OrderStatus.NEW);
        when(orderRepository.findByIdForUpdate(o.getId())).thenReturn(Optional.of(o));

        Order cancelled = app.cancelRequests().cancelByCustomer(o.getId(), "передумал");

        assertThat(cancelled.getRejectReasonCode()).isEqualTo("CHANGED_MIND");
    }

    @Test
    void changeStatus_toNew_throwsInvalidTransition() {
        Order o = persistedOrder(OrderStatus.NEW);
        // findById not needed: NEW case throws before any lookup
        assertThatThrownBy(() -> app.lifecycle().changeStatus(o.getId(), OrderStatus.NEW, null, null, true))
                .isInstanceOf(DomainException.BadRequest.class)
                .hasMessageContaining("«Новые» нельзя");
    }

    @Test
    void changeStatus_dispatchesToApprove() {
        Order o = persistedOrder(OrderStatus.NEW);
        when(orderRepository.findByIdForUpdate(o.getId())).thenReturn(Optional.of(o));

        Order result = app.lifecycle().changeStatus(o.getId(), OrderStatus.APPROVED, null, null, true);

        assertThat(result.getStatus()).isEqualTo(OrderStatus.APPROVED);
        assertThat(result.getApprovedAt()).isNotNull();
    }

    @Test
    void expireUnpaid_rejectsWithPaymentTimeoutAndRestocks() {
        Instant now = Instant.now();
        Product p = simpleProduct(1, 1_000);
        Order o = unpaidOrderWithOneItem(p, 2, now.minusSeconds(1));
        when(orderRepository.findByIdForUpdate(o.getId())).thenReturn(Optional.of(o));
        when(productRepository.findByIdForUpdate(p.getId())).thenReturn(Optional.of(p));

        Order expired = app.lifecycle().expireUnpaid(o.getId(), now);

        assertThat(expired).isNotNull();
        assertThat(expired.getStatus()).isEqualTo(OrderStatus.REJECTED);
        assertThat(expired.getRejectReasonCode()).isEqualTo(RejectReasonCode.PAYMENT_TIMEOUT.name());
        assertThat(expired.getRejectedAt()).isEqualTo(now);
        assertThat(expired.getRejectReason()).contains("24");
        assertThat(p.getStock()).isEqualTo(3); // 1 + 2 back on the shelf
        verify(events).publish(any(OrderEvents.StatusChanged.class));
    }

    @Test
    void expireUnpaid_skipsPaidNotYetDueLegacyAndMovedOnOrders() {
        Instant now = Instant.now();
        Product p = simpleProduct(1, 1_000);

        Order paid = unpaidOrderWithOneItem(p, 1, now.minusSeconds(60));
        paid.setPaid(true);
        paid.setReceivedMinor(1_000);
        Order partlyPaid = unpaidOrderWithOneItem(p, 1, now.minusSeconds(60));
        partlyPaid.setReceivedMinor(100);
        Order notDue = unpaidOrderWithOneItem(p, 1, now.plusSeconds(60));
        Order legacy = unpaidOrderWithOneItem(p, 1, null); // placed before online payment existed
        Order approved = unpaidOrderWithOneItem(p, 1, now.minusSeconds(60));
        OrderStates.withStatus(approved, OrderStatus.APPROVED);
        for (Order o : List.of(paid, partlyPaid, notDue, legacy, approved)) {
            when(orderRepository.findByIdForUpdate(o.getId())).thenReturn(Optional.of(o));
            assertThat(app.lifecycle().expireUnpaid(o.getId(), now)).isNull();
        }

        assertThat(p.getStock()).isEqualTo(1);
        assertThat(notDue.getStatus()).isEqualTo(OrderStatus.NEW);
        verify(productRepository, never()).findByIdForUpdate(any());
        verify(orderRepository, never()).save(any());
        verify(events, never()).publish(any());
    }

    @Test
    void mutations_lockTheOrderRowAndReReadIt() {
        // open-in-view: the controller has usually loaded this order already, and a locking query
        // would hand back that stale instance — the refresh under the lock is what makes the
        // status checks see a concurrent change.
        Order o = persistedOrder(OrderStatus.NEW);
        when(orderRepository.findByIdForUpdate(o.getId())).thenReturn(Optional.of(o));

        app.lifecycle().reject(o.getId(), "x", false);

        verify(orderRepository).findByIdForUpdate(o.getId());
        verify(orderRepository, never()).findById(any());
        verify(entityManager).refresh(o, LockModeType.PESSIMISTIC_WRITE);
    }

    @Test
    void reject_afterACustomerCancelCommitted_doesNotRestockTwice() {
        // Simulates the race: by the time the admin's reject gets the row lock, the customer's
        // cancel has committed. The refresh under the lock surfaces REJECTED, so the stock is not
        // returned a second time.
        Order o = persistedOrder(OrderStatus.NEW);
        Product p = simpleProduct(5, 1_000);
        OrderItem it = new OrderItem();
        it.setProductId(p.getId());
        it.setQuantity(2);
        o.getItems().add(it);
        when(orderRepository.findByIdForUpdate(o.getId())).thenReturn(Optional.of(o));
        org.mockito.Mockito.doAnswer(inv -> {
            OrderStates.withStatus(inv.getArgument(0), OrderStatus.REJECTED);
            return null;
        }).when(entityManager).refresh(o, LockModeType.PESSIMISTIC_WRITE);

        assertThatThrownBy(() -> app.lifecycle().reject(o.getId(), "x", true))
                .isInstanceOf(DomainException.BadRequest.class);
        assertThat(p.getStock()).isEqualTo(5);
        verify(productRepository, never()).findByIdForUpdate(any());
    }

    @Test
    void restoreStock_locksProductsInIdOrder() {
        Order o = persistedOrder(OrderStatus.NEW);
        byte[] high = UuidUtil.toBytes("ffffffff-0000-0000-0000-000000000000");
        byte[] low = UuidUtil.toBytes("00000000-0000-0000-0000-000000000001");
        for (byte[] pid : List.of(high, low)) {
            OrderItem it = new OrderItem();
            it.setProductId(pid);
            it.setQuantity(1);
            o.getItems().add(it);
        }
        when(orderRepository.findByIdForUpdate(o.getId())).thenReturn(Optional.of(o));
        when(productRepository.findByIdForUpdate(any())).thenReturn(Optional.empty());

        app.lifecycle().reject(o.getId(), "x", true);

        InOrder order = inOrder(productRepository);
        order.verify(productRepository).findByIdForUpdate(low);
        order.verify(productRepository).findByIdForUpdate(high);
    }

    @Test
    void rejectShipped_withReturnInTransit_doesNotRestock_andRetainsPrepayment() {
        Order o = persistedOrder(OrderStatus.SHIPPED);
        o.setPrepaymentMinor(10_000);
        o.setReceivedMinor(10_000);
        OrderItem it = new OrderItem();
        it.setProductId(productId);
        it.setQuantity(1);
        o.getItems().add(it);
        when(orderRepository.findByIdForUpdate(o.getId())).thenReturn(Optional.of(o));

        Order rejected = app.lifecycle().reject(o.getId(), null, RejectReasonCode.REFUSED_AT_POST, true, true);

        assertThat(rejected.getStatus()).isEqualTo(OrderStatus.REJECTED);
        assertThat(rejected.getReturnStatus()).isEqualTo(Order.RETURN_IN_TRANSIT);
        assertThat(rejected.getReturnSentAt()).isNotNull();
        assertThat(it.getReturnPendingQty()).isEqualTo(1);
        verify(productRepository, never()).findByIdForUpdate(any());
        verify(moneyLedger).record(eq(o.getId()), eq(com.maxsolch.shop.order.domain.OrderMoneyMovement.Kind.RETAINED),
                any(), eq(10_000L), any(), any(), any(), any());
    }
}
