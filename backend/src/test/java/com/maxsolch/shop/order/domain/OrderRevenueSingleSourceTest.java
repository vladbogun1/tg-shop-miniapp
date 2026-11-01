package com.maxsolch.shop.order.domain;

import static org.assertj.core.api.Assertions.assertThat;

import com.maxsolch.shop.analytics.domain.MetricsFacts.OrderFact;
import com.maxsolch.shop.finance.domain.MarginRows.OrderRow;
import java.time.Instant;
import org.junit.jupiter.api.Test;

/**
 * "Маржа" and the analytics used two revenue formulas that split on an order with a refunded overpayment.
 * Both now ask {@link OrderMoney#soldMinor}; this pins them to the same number on the cases that used to differ.
 */
class OrderRevenueSingleSourceTest {

    private static final Instant T = Instant.parse("2026-10-01T10:00:00Z");

    private static OrderFact fact(long total, long received, long refunded, long uncollected, long onlinePaid) {
        return new OrderFact("o", OrderStatus.DELIVERED, "MINIAPP", total, 0, 0, received, refunded, T, T, T, T, null,
                T, T, true, 1L, "n", "u", "NOVA_POSHTA", null, null, null, null, 0, null, onlinePaid, null, null,
                uncollected);
    }

    private static OrderRow row(long total, long received, long refunded, long uncollected, long onlinePaid) {
        return new OrderRow("o", total, refunded, uncollected, "DELIVERED", false, 0, received, onlinePaid);
    }

    private static void sameRevenue(long expected, long total, long received, long refunded, long uncollected,
                                    long onlinePaid) {
        assertThat(row(total, received, refunded, uncollected, onlinePaid).revenue()).isEqualTo(expected);
        assertThat(fact(total, received, refunded, uncollected, onlinePaid).soldMinor()).isEqualTo(expected);
    }

    @Test
    void refundOfAnOverpaymentIsNotCountedTwice() {
        // 1000 paid, an item for 300 removed: total 700 and 300 handed back. The shop kept 700.
        sameRevenue(70000, 70000, 100000, 30000, 0, 0);
    }

    @Test
    void deliveredResetsReceivedButTheCreditedInvoicesStillShowTheOverpayment() {
        sameRevenue(70000, 70000, 0, 30000, 0, 100000);
    }

    @Test
    void realReturnOfASoldItemStillReducesRevenue() {
        sameRevenue(40000, 100000, 100000, 60000, 0, 0);
    }

    @Test
    void partialPickupTogetherWithARefundedOverpayment() {
        // total 1000, 200 refused at the post office (never bought): collectable 800.
        // 900 received -> 100 overpaid; a refund of 100 only gives that back, so 800 stays.
        sameRevenue(80000, 100000, 90000, 10000, 20000, 0);
        // a refund of 300: 100 is the overpayment, 200 is a real return -> 600 stays
        sameRevenue(60000, 100000, 90000, 30000, 20000, 0);
    }

    @Test
    void nothingToCountForNegativeOrOversizedNumbers() {
        sameRevenue(0, 1000, 0, 5000, 0, 0);
        sameRevenue(1000, 1000, 0, -300, -50, 0);
    }
}
