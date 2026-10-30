package com.maxsolch.shop.order.domain;

import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.platform.util.UuidUtil;
import org.junit.jupiter.api.Test;

import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** The money and line invariants of {@link Order}: only its methods change them, and they hold after each call. */
class OrderAggregateTest {

    private static final Instant NOW = Instant.parse("2026-10-30T10:00:00Z");

    /** 2 x 500.00 + 1 x 300.00 = 1 300.00 before any discount. */
    private static Order order() {
        Order o = new Order();
        o.addLine(OrderItem.sold(o, UuidUtil.randomBytes(), "A", 50_000, 2));
        o.addLine(OrderItem.sold(o, UuidUtil.randomBytes(), "B", 30_000, 1));
        o.reprice();
        return o;
    }

    @Test
    void linesAreReadOnlyOutsideTheAggregate() {
        Order o = order();
        assertThatThrownBy(() -> o.getItems().add(new OrderItem())).isInstanceOf(UnsupportedOperationException.class);
        assertThat(o.getItems()).hasSize(2);
        o.removeLine(o.getItems().get(0));
        assertThat(o.getItems()).hasSize(1);
    }

    @Test
    void repriceKeepsTotalEqualToSubtotalMinusDiscountAndCapsTheStoredDiscount() {
        Order o = order();
        o.applyDiscount(10_000);
        assertThat(o.getSubtotalMinor()).isEqualTo(130_000);
        assertThat(o.getDiscountMinor()).isEqualTo(10_000);
        assertThat(o.getTotalMinor()).isEqualTo(120_000);

        // the lines shrink below the stored discount: it is capped, the total never goes negative
        o.removeLine(o.getItems().get(0));
        o.removeLine(o.getItems().get(0));
        o.reprice();
        assertThat(o.getSubtotalMinor()).isZero();
        assertThat(o.getDiscountMinor()).isZero();
        assertThat(o.getTotalMinor()).isZero();
    }

    @Test
    void adminDiscountKeepsTheGuaranteedGiftDiscountAndCapsBySubtotal() {
        Order o = order();
        o.grantGiftDiscount("SILVER", 20_000);
        assertThat(o.getGiftTier()).isEqualTo("SILVER");
        assertThat(o.getGiftDiscountMinor()).isEqualTo(20_000);
        assertThat(o.getTotalMinor()).isEqualTo(110_000);

        o.applyDiscount(5_000);
        assertThat(o.getDiscountMinor()).isEqualTo(25_000);
        assertThat(o.getGiftDiscountMinor()).isEqualTo(20_000);

        o.applyDiscount(10_000_000);
        assertThat(o.getDiscountMinor()).isEqualTo(130_000);
        assertThat(o.getGiftDiscountMinor()).isEqualTo(20_000);
        assertThat(o.getTotalMinor()).isZero();
    }

    @Test
    void firstPricingStoresTheDiscountAsComputed() {
        Order o = new Order();
        o.addLine(OrderItem.sold(o, UuidUtil.randomBytes(), "A", 40_000, 1));
        o.priceWith(4_000);
        assertThat(o.getSubtotalMinor()).isEqualTo(40_000);
        assertThat(o.getTotalMinor()).isEqualTo(36_000);
    }

    @Test
    void refundsNeverGoBelowZeroAndUndoReverses() {
        Order o = order();
        o.registerRefund(10_000);
        o.registerRefund(5_000);
        assertThat(o.getRefundedMinor()).isEqualTo(15_000);
        o.undoRefund(4_000);
        assertThat(o.getRefundedMinor()).isEqualTo(11_000);
        o.undoRefund(999_999);
        assertThat(o.getRefundedMinor()).isZero();
    }

    @Test
    void uncollectedGrowsWithRefusedUnitsAndComesBackWithoutGoingNegative() {
        Order o = order();
        o.registerUncollected(30_000);
        o.registerUncollected(50_000);
        assertThat(o.getUncollectedMinor()).isEqualTo(80_000);
        assertThat(OrderMoney.collectableMinor(o)).isEqualTo(50_000);
        o.restoreCollected(30_000);
        assertThat(o.getUncollectedMinor()).isEqualTo(50_000);
        o.restoreCollected(70_000);
        assertThat(o.getUncollectedMinor()).isZero();
    }

    @Test
    void receivedSumIsValidatedAndKeepsTheFirstPaymentDate() {
        Order o = order();
        assertThatThrownBy(() -> o.recordReceived(-1, NOW)).isInstanceOf(DomainException.class);
        assertThatThrownBy(() -> o.recordReceived(130_001, NOW)).isInstanceOf(DomainException.class)
                .hasMessageContaining("получено больше суммы заказа");

        o.recordReceived(50_000, NOW);
        assertThat(o.isPaid()).isTrue();
        assertThat(o.getPaidAt()).isEqualTo(NOW);
        o.recordReceived(60_000, NOW.plusSeconds(60));
        assertThat(o.getPaidAt()).as("a correction does not move the payment date").isEqualTo(NOW);
        o.recordReceived(0, NOW.plusSeconds(120));
        assertThat(o.isPaid()).isFalse();
        assertThat(o.getPaidAt()).isNull();
    }

    @Test
    void onlinePaymentIsCappedByTheTotalAndMarksPaid() {
        Order o = order();
        o.receiveOnline(100_000, NOW);
        assertThat(o.getReceivedMinor()).isEqualTo(100_000);
        assertThat(o.isPaid()).isTrue();
        assertThat(o.creditableOnlineMinor(50_000)).isEqualTo(30_000);
        o.receiveOnline(50_000, NOW.plusSeconds(1));
        assertThat(o.getReceivedMinor()).isEqualTo(130_000);
        assertThat(o.getPaidAt()).isEqualTo(NOW);
        assertThat(o.creditableOnlineMinor(1)).isZero();
    }

    @Test
    void mergedOrderGivesItsPaidMoneyOver() {
        Order target = order();
        Order source = new Order();
        OrderFixtures.set(source, "paidAt", NOW.minusSeconds(5));
        target.absorbPaid(20_000, source, NOW);
        assertThat(target.getReceivedMinor()).isEqualTo(20_000);
        assertThat(target.isPaid()).isTrue();
        assertThat(target.getPaidAt()).isEqualTo(NOW.minusSeconds(5));
    }

    @Test
    void cancelRequestWalksThroughItsStates() {
        Order o = order();
        o.requestCancel("передумал", NOW);
        assertThat(o.isCancelRequestPending()).isTrue();
        assertThatThrownBy(() -> o.approve(NOW)).isInstanceOf(DomainException.class);

        o.approveCancelRequest(NOW.plusSeconds(1), "   ");
        assertThat(o.getCancelRequestStatus()).isEqualTo("APPROVED");
        assertThat(o.getCancelRequestAdminComment()).isNull();
        assertThat(o.getCancelRequestResolvedAt()).isEqualTo(NOW.plusSeconds(1));
    }

    @Test
    void returnTrailFollowsTheParcel() {
        Order o = order();
        o.markUnitsSentBack(NOW);
        o.markUnitsSentBack(NOW.plusSeconds(10));
        assertThat(o.getReturnStatus()).isEqualTo(Order.RETURN_IN_TRANSIT);
        assertThat(o.getReturnSentAt()).as("a second batch does not restart the trip").isEqualTo(NOW);
        o.markReturnReceived(NOW.plusSeconds(20));
        assertThat(o.getReturnStatus()).isEqualTo(Order.RETURN_RECEIVED);
        o.settleReturnTrail(false);
        assertThat(o.getReturnStatus()).isNull();
        assertThat(o.getReturnReceivedAt()).isNull();
    }

    @Test
    void lineReturnCountersStayInRange() {
        Order o = order();
        OrderItem a = o.getItems().get(0);
        a.registerSentBack(2);
        assertThat(a.getReturnedQty()).isEqualTo(2);
        assertThat(a.getReturnPendingQty()).isEqualTo(2);
        a.markRestocked(5);
        assertThat(a.getRestockedQty()).as("never more than the line has").isEqualTo(2);
        a.unmarkRestocked(9);
        assertThat(a.getRestockedQty()).isZero();
        a.reduceReturnPending(9);
        a.unregisterReturned(9);
        assertThat(a.getReturnPendingQty()).isZero();
        assertThat(a.getReturnedQty()).isZero();
    }
}
