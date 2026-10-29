package com.maxsolch.shop.service;

import com.maxsolch.shop.domain.Order;
import com.maxsolch.shop.domain.OrderItem;
import org.junit.jupiter.api.Disabled;
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
        new OrderService(null, null, null, null, null, null, null, null, null, null).recomputeOrderTotals(o);
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
        assertThat(OrderService.dueOnlineMinor(o)).isEqualTo(100_000);
        o.setPrepaymentMinor(20_000);
        assertThat(OrderService.dueOnlineMinor(o)).isEqualTo(20_000);
        o.setPrepaymentMinor(500_000);
        assertThat(OrderService.dueOnlineMinor(o)).isEqualTo(100_000);
    }

    @Test
    void amountDue_isDueOnlineMinusReceived_neverNegative() {
        Order o = order(100_000, 30_000);
        assertThat(OrderService.amountDueMinor(o)).isEqualTo(70_000);
        o.setReceivedMinor(100_000);
        assertThat(OrderService.amountDueMinor(o)).isZero();
        o.setReceivedMinor(150_000);
        assertThat(OrderService.amountDueMinor(o)).isZero();
        o.setReceivedMinor(-5);
        assertThat(OrderService.amountDueMinor(o)).isEqualTo(100_000);
        Order pre = order(100_000, 5_000);
        pre.setPrepaymentMinor(20_000);
        assertThat(OrderService.amountDueMinor(pre)).isEqualTo(15_000);
        pre.setReceivedMinor(20_000);
        assertThat(OrderService.amountDueMinor(pre)).isZero();
    }

    @Test
    void collectable_isTotalMinusUncollected_neverNegative() {
        Order o = order(100_000, 0);
        assertThat(OrderService.collectableMinor(o)).isEqualTo(100_000);
        o.setUncollectedMinor(30_000);
        assertThat(OrderService.collectableMinor(o)).isEqualTo(70_000);
        o.setUncollectedMinor(900_000);
        assertThat(OrderService.collectableMinor(o)).isZero();
        o.setUncollectedMinor(-10);
        assertThat(OrderService.collectableMinor(o)).isEqualTo(100_000);
    }

    @Test
    void onlinePaymentMissing_needsDeadline_andSomethingStillDue() {
        Order o = order(100_000, 0);
        assertThat(OrderService.onlinePaymentMissing(o)).isFalse(); // older order: no deadline
        o.setPaymentDueAt(Instant.now());
        assertThat(OrderService.onlinePaymentMissing(o)).isTrue();
        o.setReceivedMinor(100_000);
        assertThat(OrderService.onlinePaymentMissing(o)).isFalse();
        Order pre = order(100_000, 20_000);
        pre.setPrepaymentMinor(20_000);
        pre.setPaymentDueAt(Instant.now());
        assertThat(OrderService.onlinePaymentMissing(pre)).isFalse();
    }

    @Test
    void received_isCappedAtTotal_andNeverNegative_codIsTheRest() {
        Order o = order(100_000, 30_000);
        assertThat(OrderQueryService.receivedMinor(o)).isEqualTo(30_000);
        assertThat(OrderQueryService.codMinor(o)).isEqualTo(70_000);
        o.setReceivedMinor(250_000);
        assertThat(OrderQueryService.receivedMinor(o)).isEqualTo(100_000);
        assertThat(OrderQueryService.codMinor(o)).isZero();
        o.setReceivedMinor(-7);
        assertThat(OrderQueryService.receivedMinor(o)).isZero();
        assertThat(OrderQueryService.codMinor(o)).isEqualTo(100_000);
        Order part = order(100_000, 20_000);
        part.setUncollectedMinor(30_000);
        assertThat(OrderQueryService.codMinor(part)).isEqualTo(50_000);
    }

    // ----- refundable = received - max(0, refunded) -----

    @Test
    void refundable_isRawReceivedMinusRefunded_notCappedAtTotal() {
        Order o = order(100_000, 130_000);
        o.setRefundedMinor(10_000);
        assertThat(OrderAdjustmentService.refundableMinor(o)).isEqualTo(120_000);
        o.setRefundedMinor(-5);
        assertThat(OrderAdjustmentService.refundableMinor(o)).isEqualTo(130_000);
        o.setRefundedMinor(900_000);
        assertThat(OrderAdjustmentService.refundableMinor(o)).isZero();
        o.setReceivedMinor(-1);
        o.setRefundedMinor(0);
        assertThat(OrderAdjustmentService.refundableMinor(o)).isZero();
    }

    // ----- unitPaidMinor: ТЕКУЩИЕ значения (double + округление на единицу) -----

    /** Принимает строки {цена, количество}; возвращает unitPaid по каждой строке. */
    private static long[] unitPaid(long discount, long[][] priceQty) {
        Order o = new Order();
        o.setItems(new ArrayList<>());
        List<OrderItem> its = new ArrayList<>();
        long sub = 0;
        for (long[] pq : priceQty) {
            its.add(line(o, pq[0], (int) pq[1], false));
            sub += pq[0] * pq[1];
        }
        o.setSubtotalMinor(sub);
        o.setDiscountMinor(discount);
        o.setTotalMinor(Math.max(0, sub - discount));
        long[] out = new long[its.size()];
        for (int i = 0; i < out.length; i++) {
            out[i] = OrderAdjustmentService.unitPaidMinor(o, its.get(i));
        }
        return out;
    }

    private static long sumByLines(long[] unit, long[][] priceQty) {
        long s = 0;
        for (int i = 0; i < unit.length; i++) {
            s += unit[i] * priceQty[i][1];
        }
        return s;
    }

    @Test
    void unitPaid_noDiscount_isThePrice() {
        assertThat(unitPaid(0, new long[][]{{12_345, 2}})).containsExactly(12_345);
    }

    @Test
    void unitPaid_exampleA_discountSpreadProportionally() {
        long[][] l = {{10_000, 1}, {15_000, 2}};
        long[] u = unitPaid(10_000, l);
        assertThat(u).containsExactly(7_500, 11_250);
        assertThat(sumByLines(u, l)).isEqualTo(30_000); // total 30000: сходится
    }

    @Test
    void unitPaid_exampleB_qtyThree_oddSum() {
        long[][] l = {{3_333, 3}};
        long[] u = unitPaid(1_000, l);
        assertThat(u).containsExactly(3_000);
        assertThat(sumByLines(u, l)).isEqualTo(9_000); // total 8999
    }

    @Test
    void unitPaid_exampleC_threeEqualLines() {
        long[][] l = {{999, 1}, {999, 1}, {999, 1}};
        long[] u = unitPaid(100, l);
        assertThat(u).containsExactly(966, 966, 966);
        assertThat(sumByLines(u, l)).isEqualTo(2_898); // total 2897
    }

    @Test
    void unitPaid_exampleD_tinyDiscount() {
        long[][] l = {{10_001, 1}, {2, 5}};
        long[] u = unitPaid(7, l);
        assertThat(u).containsExactly(9_994, 2);
        assertThat(sumByLines(u, l)).isEqualTo(10_004);
    }

    @Test
    void unitPaid_exampleE_cheapLineRoundsToZero() {
        long[][] l = {{5_000, 2}, {1, 1}};
        long[] u = unitPaid(5_001, l);
        assertThat(u).containsExactly(2_500, 0);
        assertThat(sumByLines(u, l)).isEqualTo(5_000);
    }

    @Test
    void unitPaid_exampleF_threeDifferentLines() {
        long[][] l = {{1_999, 1}, {2_999, 1}, {3_999, 1}};
        long[] u = unitPaid(1_500, l);
        assertThat(u).containsExactly(1_666, 2_499, 3_332);
        assertThat(sumByLines(u, l)).isEqualTo(7_497);
    }

    @Test
    void unitPaid_exampleG_qtyThree_fullDiscountThird() {
        long[][] l = {{100, 3}};
        long[] u = unitPaid(100, l);
        assertThat(u).containsExactly(67);
        assertThat(sumByLines(u, l)).isEqualTo(201); // total 200
    }

    @Test
    void unitPaid_giftAndZeroPriceCostNothing() {
        Order o = order(10_000, 0);
        o.setSubtotalMinor(10_000);
        o.setDiscountMinor(1_000);
        OrderItem gift = line(o, 5_000, 1, true);
        OrderItem free = line(o, 0, 1, false);
        assertThat(OrderAdjustmentService.unitPaidMinor(o, gift)).isZero();
        assertThat(OrderAdjustmentService.unitPaidMinor(o, free)).isZero();
    }

    @Test
    void unitPaid_sumOverLinesEqualsTotal_onEvenOrders() {
        long[][] a = {{10_000, 1}, {15_000, 2}};
        assertThat(sumByLines(unitPaid(10_000, a), a)).isEqualTo(30_000);
        long[][] f = {{1_999, 1}, {2_999, 1}, {3_999, 1}};
        assertThat(sumByLines(unitPaid(1_500, f), f)).isEqualTo(7_497);
    }

    /**
     * Сумма unitPaid x qty по строкам против total: на «ровных» заказах сходится, на нечётных
     * расходится на копейки. Если решат раскладывать остаток на последнюю строку, тест включают.
     */
    @Disabled("расхождение копеек, решает владелец: B 9000 vs 8999 (+1), C 2898 vs 2897 (+1), G 201 vs 200 (+1)")
    @Test
    void unitPaid_sumOverLinesEqualsTotal_onOddOrders() {
        long[][][] orders = {{{3_333, 3}}, {{999, 1}, {999, 1}, {999, 1}}, {{100, 3}}};
        long[] discounts = {1_000, 100, 100};
        for (int i = 0; i < orders.length; i++) {
            long sub = 0;
            for (long[] pq : orders[i]) {
                sub += pq[0] * pq[1];
            }
            assertThat(sumByLines(unitPaid(discounts[i], orders[i]), orders[i]))
                    .isEqualTo(Math.max(0, sub - discounts[i]));
        }
    }
}
