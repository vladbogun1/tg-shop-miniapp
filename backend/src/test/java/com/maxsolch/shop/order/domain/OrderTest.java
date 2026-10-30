package com.maxsolch.shop.order.domain;

import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.platform.util.UuidUtil;
import org.junit.jupiter.api.Test;

import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** The aggregate on its own: the state machine, no Spring, no repositories. */
class OrderTest {

    private static final Instant NOW = Instant.parse("2026-10-29T10:00:00Z");

    private static Order order(OrderStatus status) {
        Order o = new Order();
        OrderFixtures.set(o, "id", UuidUtil.randomBytes());
        OrderStates.withStatus(o, status);
        return o;
    }

    @Test
    void newOrderStartsNewAndWalksApproveShipDeliver() {
        Order o = new Order();
        assertThat(o.getStatus()).isEqualTo(OrderStatus.NEW);
        OrderFixtures.set(o, "totalMinor", 10_000);
        OrderFixtures.set(o, "receivedMinor", 10_000);
        OrderFixtures.set(o, "paid", true);

        o.approve(NOW);
        assertThat(o.getStatus()).isEqualTo(OrderStatus.APPROVED);
        assertThat(o.getApprovedAt()).isEqualTo(NOW);

        o.ship("  20450000000000 ", false, NOW.plusSeconds(1));
        assertThat(o.getStatus()).isEqualTo(OrderStatus.SHIPPED);
        assertThat(o.getTrackingNumber()).isEqualTo("20450000000000");

        o.deliver(NOW.plusSeconds(2));
        assertThat(o.getStatus()).isEqualTo(OrderStatus.DELIVERED);
        assertThat(o.getDeliveredAt()).isEqualTo(NOW.plusSeconds(2));
    }

    @Test
    void deliverSettlesTheRestAsReceivedAndNeverLowersIt() {
        Order cod = order(OrderStatus.SHIPPED);
        OrderFixtures.set(cod, "totalMinor", 10_000);
        OrderFixtures.set(cod, "receivedMinor", 2_000);
        cod.deliver(NOW);
        assertThat(cod.getReceivedMinor()).isEqualTo(10_000);
        assertThat(cod.isPaid()).isTrue();
        assertThat(cod.getPaidAt()).isEqualTo(NOW);

        Order overpaid = order(OrderStatus.SHIPPED);
        OrderFixtures.set(overpaid, "totalMinor", 5_000);
        OrderFixtures.set(overpaid, "receivedMinor", 8_000);
        overpaid.deliver(NOW);
        assertThat(overpaid.getReceivedMinor()).isEqualTo(8_000);
    }

    @Test
    void wrongTransitionsKeepTheStatusAndTheOldTexts() {
        Order delivered = order(OrderStatus.DELIVERED);
        assertThatThrownBy(() -> delivered.approve(NOW)).isInstanceOf(DomainException.BadRequest.class)
                .hasMessage("одобрить можно только новый заказ");
        assertThatThrownBy(() -> delivered.ship(null, true, NOW)).hasMessage("отправить можно только новый или одобренный заказ");
        Order fresh = order(OrderStatus.NEW);
        assertThatThrownBy(() -> fresh.deliver(NOW)).hasMessage("доставленным можно отметить только отправленный заказ");
        assertThat(fresh.getStatus()).isEqualTo(OrderStatus.NEW);
        assertThat(delivered.getStatus()).isEqualTo(OrderStatus.DELIVERED);
    }

    @Test
    void pendingCancelRequestBlocksApproveAndShip() {
        Order o = order(OrderStatus.NEW);
        OrderFixtures.set(o, "cancelRequestStatus", CancelRequestStatus.PENDING.name());
        assertThatThrownBy(() -> o.approve(NOW)).hasMessageContaining("запрос отмены");
        assertThatThrownBy(() -> o.ship("1", true, NOW)).hasMessageContaining("запрос отмены");
        assertThat(o.getStatus()).isEqualTo(OrderStatus.NEW);
    }

    @Test
    void shipWithoutTheOnlinePaymentNeedsConfirmation() {
        Order o = order(OrderStatus.APPROVED);
        OrderFixtures.set(o, "totalMinor", 10_000);
        OrderFixtures.set(o, "paymentDueAt", NOW);
        assertThatThrownBy(() -> o.ship("1", false, NOW)).isInstanceOfSatisfying(DomainException.class,
                e -> assertThat(e.getCode()).isEqualTo(OrderError.SHIP_PREPAYMENT_MISSING.code()));
        o.ship("1", true, NOW);
        assertThat(o.getStatus()).isEqualTo(OrderStatus.SHIPPED);
    }

    @Test
    void rejectWritesTheCauseAndRefusesClosedOrders() {
        Order o = order(OrderStatus.APPROVED);
        o.reject(new RejectCause(NOW, "передумал", RejectReasonCode.CHANGED_MIND.name(), true));
        assertThat(o.getStatus()).isEqualTo(OrderStatus.REJECTED);
        assertThat(o.getRejectedAt()).isEqualTo(NOW);
        assertThat(o.getRejectReason()).isEqualTo("передумал");
        assertThat(o.getRejectReasonCode()).isEqualTo("CHANGED_MIND");
        assertThat(o.isCancelledByCustomer()).isTrue();
        assertThatThrownBy(() -> o.reject(new RejectCause(NOW, null, null, false))).hasMessage("заказ уже отклонён");

        Order delivered = order(OrderStatus.DELIVERED);
        assertThatThrownBy(() -> delivered.reject(new RejectCause(NOW, null, null, false)))
                .isInstanceOfSatisfying(DomainException.class, e -> {
                    assertThat(e.getMessage()).isEqualTo(Order.REJECT_DELIVERED);
                    assertThat(e.getCode()).isEqualTo("ORDER_DELIVERED_REJECT");
                });
    }

    @Test
    void markMergedClosesTheOrderIntoTheTargetWithoutDeadline() {
        Order o = order(OrderStatus.NEW);
        OrderFixtures.set(o, "paymentDueAt", NOW);
        byte[] target = UuidUtil.randomBytes();
        o.markMerged(NOW, "Объединён в заказ #abc", target);
        assertThat(o.getStatus()).isEqualTo(OrderStatus.REJECTED);
        assertThat(o.getRejectReasonCode()).isEqualTo("MERGED");
        assertThat(o.getMergedIntoOrderId()).isEqualTo(target);
        assertThat(o.getPaymentDueAt()).isNull();
        assertThat(o.isCancelledByCustomer()).isFalse();
    }

    @Test
    void settleIfFreeOnlyForAnOpenPaidlessZeroOrderWithLines() {
        Order empty = order(OrderStatus.NEW);
        empty.settleIfFree(NOW);
        assertThat(empty.isPaid()).isFalse();

        Order free = order(OrderStatus.NEW);
        free.addLine(new OrderItem());
        OrderFixtures.set(free, "paymentDueAt", NOW);
        free.settleIfFree(NOW);
        assertThat(free.isPaid()).isTrue();
        assertThat(free.getPaymentDueAt()).isNull();

        Order shipped = order(OrderStatus.SHIPPED);
        shipped.addLine(new OrderItem());
        shipped.settleIfFree(NOW);
        assertThat(shipped.isPaid()).isFalse();
    }

    @Test
    void returnInTransitWaitsForTheUnitsNotYetRestocked() {
        Order o = order(OrderStatus.SHIPPED);
        OrderItem line = new OrderItem();
        OrderFixtures.set(line, "quantity", 3);
        OrderFixtures.set(line, "restockedQty", 1);
        o.addLine(line);
        o.markReturnInTransit(NOW);
        assertThat(o.getReturnStatus()).isEqualTo(Order.RETURN_IN_TRANSIT);
        assertThat(o.getReturnSentAt()).isEqualTo(NOW);
        assertThat(line.getReturnPendingQty()).isEqualTo(2);
    }
}
