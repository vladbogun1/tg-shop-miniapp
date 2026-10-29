package com.maxsolch.shop.order.app;

import com.maxsolch.shop.order.domain.OrderMoney;

import com.maxsolch.shop.order.domain.Order;
import com.maxsolch.shop.order.domain.OrderItem;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Характеризующие тесты денежной арифметики заказа: фиксируют ТЕКУЩИЕ формулы там, где они живут
 * (OrderService, OrderQueryService, OrderAdjustmentService). Поведение не менять — тест это ловит.
 */
class OrderMoneyTest {

    private static Order order(long total, long received) {
        Order o = new Order();
        o.setItems(new ArrayList<>());
        o.setTotalMinor(total);
        o.setReceivedMinor(received);
        return o;
    }

    private static OrderItem line(Order o, long price, int qty, boolean gift) {
        OrderItem it = new OrderItem();
        it.setOrder(o);
        it.setPriceMinorSnapshot(price);
        it.setQuantity(qty);
        it.setGift(gift);
        o.getItems().add(it);
        return it;
    }

    // ----- subtotal / total (OrderService.recomputeTotals) -----

    private static Order repriced(long discount, long giftDiscount, long[][] priceQty) {
        Order o = new Order();
        o.setItems(new ArrayList<>());
        for (long[] pq : priceQty) {
            line(o, pq[0], (int) pq[1], false);
        }
        o.setDiscountMinor(discount);
        o.setGiftDiscountMinor(giftDiscount);
        OrderApp.create(null, null, null, null, null, null, null, null, null, null, null, null).service().recomputeOrderTotals(o);
        return o;
    }

    @Test
    void recompute_subtotalIsSumOfPriceTimesQty_totalIsSubtotalMinusDiscount() {
        Order o = repriced(5_000, 0, new long[][]{{10_000, 1}, {15_000, 2}});
        assertThat(o.getSubtotalMinor()).isEqualTo(40_000);
        assertThat(o.getDiscountMinor()).isEqualTo(5_000);
        assertThat(o.getTotalMinor()).isEqualTo(35_000);
    }

    @Test
    void recompute_discountIsCappedAtSubtotal_negativeDiscountIsZero() {
        Order big = repriced(99_000, 0, new long[][]{{10_000, 1}});
        assertThat(big.getDiscountMinor()).isEqualTo(10_000);
        assertThat(big.getTotalMinor()).isZero();
        Order neg = repriced(-50, 0, new long[][]{{10_000, 1}});
        assertThat(neg.getDiscountMinor()).isZero();
        assertThat(neg.getTotalMinor()).isEqualTo(10_000);
    }

    @Test
    void recompute_giftDiscountIsCappedAtDiscount() {
        Order o = repriced(3_000, 8_000, new long[][]{{10_000, 1}});
        assertThat(o.getGiftDiscountMinor()).isEqualTo(3_000);
        assertThat(o.getTotalMinor()).isEqualTo(7_000);
    }

    @Test
    void recompute_freeOrderBecomesPaid() {
        Order o = repriced(10_000, 0, new long[][]{{10_000, 1}});
        assertThat(o.getTotalMinor()).isZero();
        assertThat(o.isPaid()).isTrue();
        assertThat(o.getPaidAt()).isNotNull();
        assertThat(o.getPaymentDueAt()).isNull();
    }

    // ----- due / collectable / cod (OrderService.*, OrderQueryService.*) -----

    @Test
    void dueOnline_isTotalWithoutPrepayment_orThePrepaymentCappedAtTotal() {
        Order o = order(100_000, 0);
        assertThat(OrderMoney.dueOnlineMinor(o)).isEqualTo(100_000);
        o.setPrepaymentMinor(20_000);
        assertThat(OrderMoney.dueOnlineMinor(o)).isEqualTo(20_000);
        o.setPrepaymentMinor(500_000);
        assertThat(OrderMoney.dueOnlineMinor(o)).isEqualTo(100_000);
    }

    @Test
    void amountDue_isDueOnlineMinusReceived_neverNegative() {
        Order o = order(100_000, 30_000);
        assertThat(OrderMoney.amountDueMinor(o)).isEqualTo(70_000);
        o.setReceivedMinor(100_000);
        assertThat(OrderMoney.amountDueMinor(o)).isZero();
        o.setReceivedMinor(150_000);
        assertThat(OrderMoney.amountDueMinor(o)).isZero();
        o.setReceivedMinor(-5);
        assertThat(OrderMoney.amountDueMinor(o)).isEqualTo(100_000);
        Order pre = order(100_000, 5_000);
        pre.setPrepaymentMinor(20_000);
        assertThat(OrderMoney.amountDueMinor(pre)).isEqualTo(15_000);
        pre.setReceivedMinor(20_000);
        assertThat(OrderMoney.amountDueMinor(pre)).isZero();
    }

    @Test
    void collectable_isTotalMinusUncollected_neverNegative() {
        Order o = order(100_000, 0);
        assertThat(OrderMoney.collectableMinor(o)).isEqualTo(100_000);
        o.setUncollectedMinor(30_000);
        assertThat(OrderMoney.collectableMinor(o)).isEqualTo(70_000);
        o.setUncollectedMinor(900_000);
        assertThat(OrderMoney.collectableMinor(o)).isZero();
        o.setUncollectedMinor(-10);
        assertThat(OrderMoney.collectableMinor(o)).isEqualTo(100_000);
    }

    @Test
    void onlinePaymentMissing_needsDeadline_andSomethingStillDue() {
        Order o = order(100_000, 0);
        assertThat(OrderMoney.onlinePaymentMissing(o)).isFalse(); // older order: no deadline
        o.setPaymentDueAt(Instant.now());
        assertThat(OrderMoney.onlinePaymentMissing(o)).isTrue();
        o.setReceivedMinor(100_000);
        assertThat(OrderMoney.onlinePaymentMissing(o)).isFalse();
        Order pre = order(100_000, 20_000);
        pre.setPrepaymentMinor(20_000);
        pre.setPaymentDueAt(Instant.now());
        assertThat(OrderMoney.onlinePaymentMissing(pre)).isFalse();
    }

    @Test
    void received_isCappedAtTotal_andNeverNegative_codIsTheRest() {
        Order o = order(100_000, 30_000);
        assertThat(OrderMoney.receivedMinor(o)).isEqualTo(30_000);
        assertThat(OrderMoney.codMinor(o)).isEqualTo(70_000);
        o.setReceivedMinor(250_000);
        assertThat(OrderMoney.receivedMinor(o)).isEqualTo(100_000);
        assertThat(OrderMoney.codMinor(o)).isZero();
        o.setReceivedMinor(-7);
        assertThat(OrderMoney.receivedMinor(o)).isZero();
        assertThat(OrderMoney.codMinor(o)).isEqualTo(100_000);
        Order part = order(100_000, 20_000);
        part.setUncollectedMinor(30_000);
        assertThat(OrderMoney.codMinor(part)).isEqualTo(50_000);
    }

    // ----- refundable = received - max(0, refunded) -----

    @Test
    void refundable_isRawReceivedMinusRefunded_notCappedAtTotal() {
        Order o = order(100_000, 130_000);
        o.setRefundedMinor(10_000);
        assertThat(OrderMoney.refundableMinor(o)).isEqualTo(120_000);
        o.setRefundedMinor(-5);
        assertThat(OrderMoney.refundableMinor(o)).isEqualTo(130_000);
        o.setRefundedMinor(900_000);
        assertThat(OrderMoney.refundableMinor(o)).isZero();
        o.setReceivedMinor(-1);
        o.setRefundedMinor(0);
        assertThat(OrderMoney.refundableMinor(o)).isZero();
    }

    // ----- сколько заплачено за строку: целочисленно, сумма по строкам == подитог − скидка -----

    private static Order orderOf(long discount, long[][] priceQty) {
        Order o = new Order();
        o.setItems(new ArrayList<>());
        long sub = 0;
        for (long[] pq : priceQty) {
            line(o, pq[0], (int) pq[1], false);
            sub += pq[0] * pq[1];
        }
        o.setSubtotalMinor(sub);
        o.setDiscountMinor(discount);
        o.setTotalMinor(Math.max(0, sub - discount));
        return o;
    }

    /** unitPaid по каждой строке (цена за штуку для показа). */
    private static long[] unitPaid(long discount, long[][] priceQty) {
        Order o = orderOf(discount, priceQty);
        long[] out = new long[priceQty.length];
        for (int i = 0; i < out.length; i++) {
            out[i] = OrderMoney.unitPaidMinor(o, o.getItems().get(i));
        }
        return out;
    }

    /** linePaid по каждой строке. */
    private static long[] linePaid(long discount, long[][] priceQty) {
        Order o = orderOf(discount, priceQty);
        long[] out = new long[priceQty.length];
        for (int i = 0; i < out.length; i++) {
            out[i] = OrderMoney.linePaidMinor(o, o.getItems().get(i));
        }
        return out;
    }

    private static long sum(long[] a) {
        long s = 0;
        for (long v : a) {
            s += v;
        }
        return s;
    }

    @Test
    void unitPaid_noDiscount_isThePrice() {
        assertThat(unitPaid(0, new long[][]{{12_345, 2}})).containsExactly(12_345);
    }

    @Test
    void linePaid_exampleA_discountSpreadProportionally() {
        long[][] l = {{10_000, 1}, {15_000, 2}};
        assertThat(linePaid(10_000, l)).containsExactly(7_500, 22_500);
        assertThat(unitPaid(10_000, l)).containsExactly(7_500, 11_250);
    }

    @Test
    void linePaid_exampleB_qtyThree_noExtraKopeck() {
        long[][] l = {{3_333, 3}};
        assertThat(linePaid(1_000, l)).containsExactly(8_999); // total 8999
        assertThat(unitPaid(1_000, l)).containsExactly(2_999);
    }

    @Test
    void linePaid_exampleC_threeEqualLines_remainderGoesToTheFirst() {
        long[][] l = {{999, 1}, {999, 1}, {999, 1}};
        assertThat(linePaid(100, l)).containsExactly(965, 966, 966); // total 2897
    }

    @Test
    void linePaid_exampleD_tinyDiscount() {
        long[][] l = {{10_001, 1}, {2, 5}};
        assertThat(linePaid(7, l)).containsExactly(9_994, 10);
        assertThat(unitPaid(7, l)).containsExactly(9_994, 2);
    }

    @Test
    void linePaid_exampleE_cheapLineRoundsToZero() {
        long[][] l = {{5_000, 2}, {1, 1}};
        assertThat(linePaid(5_001, l)).containsExactly(5_000, 0);
        assertThat(unitPaid(5_001, l)).containsExactly(2_500, 0);
    }

    @Test
    void linePaid_exampleF_threeDifferentLines_largestRemainder() {
        long[][] l = {{1_999, 1}, {2_999, 1}, {3_999, 1}};
        assertThat(linePaid(1_500, l)).containsExactly(1_666, 2_499, 3_332);
    }

    @Test
    void linePaid_exampleG_qtyThree_fullDiscountThird() {
        long[][] l = {{100, 3}};
        assertThat(linePaid(100, l)).containsExactly(200); // total 200
        assertThat(unitPaid(100, l)).containsExactly(66);
    }

    @Test
    void unitPaid_giftAndZeroPriceCostNothing() {
        Order o = order(10_000, 0);
        o.setSubtotalMinor(10_000);
        o.setDiscountMinor(1_000);
        OrderItem gift = line(o, 5_000, 1, true);
        OrderItem free = line(o, 0, 1, false);
        assertThat(OrderMoney.linePaidMinor(o, gift)).isZero();
        assertThat(OrderMoney.linePaidMinor(o, free)).isZero();
        assertThat(OrderMoney.unitPaidMinor(o, gift)).isZero();
        assertThat(OrderMoney.unitPaidMinor(o, free)).isZero();
    }

    /** Раньше (double, округление на единицу) тут выходило +1 копейка: 9000 при итоге 8999 и т.п. */
    @Test
    void linePaid_sumOverLinesEqualsTotal_onOddOrders() {
        long[][][] orders = {{{3_333, 3}}, {{999, 1}, {999, 1}, {999, 1}}, {{100, 3}},
                {{10_000, 1}, {15_000, 2}}, {{10_001, 1}, {2, 5}}, {{5_000, 2}, {1, 1}},
                {{1_999, 1}, {2_999, 1}, {3_999, 1}}, {{7, 1}, {7, 1}, {7, 1}, {7, 1}, {7, 1}, {7, 1}, {7, 1}}};
        long[] discounts = {1_000, 100, 100, 10_000, 7, 5_001, 1_500, 5};
        for (int i = 0; i < orders.length; i++) {
            long sub = 0;
            for (long[] pq : orders[i]) {
                sub += pq[0] * pq[1];
            }
            assertThat(sum(linePaid(discounts[i], orders[i]))).as("order #%d", i)
                    .isEqualTo(Math.max(0, sub - discounts[i]));
        }
    }

    @Test
    void linePaid_discountEqualToSubtotal_everythingIsFree() {
        long[][] l = {{999, 1}, {1_001, 2}};
        assertThat(linePaid(3_001, l)).containsExactly(0, 0);
    }

    @Test
    void linePaid_giftLinesTakeNoShareOfTheDiscount() {
        Order o = order(9_000, 0);
        OrderItem a = line(o, 5_000, 1, false);
        OrderItem gift = line(o, 0, 1, true);
        OrderItem b = line(o, 5_000, 1, false);
        o.setDiscountMinor(1_001);
        assertThat(OrderMoney.linePaidMinor(o, gift)).isZero();
        assertThat(OrderMoney.linePaidMinor(o, a) + OrderMoney.linePaidMinor(o, b)).isEqualTo(8_999);
    }

    @Test
    void paidForUnits_anySequenceOfReturnsAddsUpToTheLine() {
        Order o = orderOf(1_000, new long[][]{{3_333, 3}});
        OrderItem it = o.getItems().get(0);
        // line = 8999: по одной штуке — 2999 + 3000 + 3000
        assertThat(OrderMoney.paidForUnitsMinor(o, it, 0, 1)).isEqualTo(2_999);
        assertThat(OrderMoney.paidForUnitsMinor(o, it, 1, 1)).isEqualTo(3_000);
        assertThat(OrderMoney.paidForUnitsMinor(o, it, 2, 1)).isEqualTo(3_000);
        // сразу всё и по частям — одно и то же
        assertThat(OrderMoney.paidForUnitsMinor(o, it, 0, 3)).isEqualTo(8_999);
        assertThat(OrderMoney.paidForUnitsMinor(o, it, 0, 2) + OrderMoney.paidForUnitsMinor(o, it, 2, 1))
                .isEqualTo(8_999);
        assertThat(OrderMoney.paidForUnitsMinor(o, it, 1, 2)).isEqualTo(6_000);
    }

    @Test
    void paidForUnits_guards() {
        Order o = orderOf(0, new long[][]{{1_000, 2}});
        OrderItem it = o.getItems().get(0);
        assertThat(OrderMoney.paidForUnitsMinor(o, it, 0, 0)).isZero();
        assertThat(OrderMoney.paidForUnitsMinor(o, it, 2, 1)).isZero(); // всё уже возвращено
        assertThat(OrderMoney.paidForUnitsMinor(o, it, 1, 5)).isEqualTo(1_000); // не больше остатка строки
    }
}
