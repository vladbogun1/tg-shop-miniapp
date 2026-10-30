package com.maxsolch.shop.gift.app;

import com.maxsolch.shop.order.domain.OrderFixtures;
import com.maxsolch.shop.order.domain.OrderStates;
import com.maxsolch.shop.order.domain.GiftCaseRules;
import com.maxsolch.shop.order.domain.Order;
import com.maxsolch.shop.order.domain.OrderStatus;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class GiftCaseOpenableTest {

    private static Order order(String caseStatus, OrderStatus status, boolean paid, long received) {
        Order o = new Order();
        OrderFixtures.set(o, "giftCaseStatus", caseStatus);
        OrderStates.withStatus(o, status);
        OrderFixtures.set(o, "totalMinor", 300_000);
        OrderFixtures.set(o, "paid", paid);
        OrderFixtures.set(o, "receivedMinor", received);
        return o;
    }

    @Test
    void onlyAPaidSealedCaseOpens() {
        assertThat(GiftCaseRules.giftCaseOpenable(order("SEALED", OrderStatus.NEW, false, 0))).isFalse();
        assertThat(GiftCaseRules.giftCaseOpenable(order("SEALED", OrderStatus.NEW, true, 300_000))).isTrue();
        assertThat(GiftCaseRules.giftCaseOpenable(order("SEALED", OrderStatus.APPROVED, true, 10_000))).isTrue();
    }

    @Test
    void openedRejectedOrNoCaseDoNotOpen() {
        assertThat(GiftCaseRules.giftCaseOpenable(order("OPENED", OrderStatus.APPROVED, true, 300_000))).isFalse();
        assertThat(GiftCaseRules.giftCaseOpenable(order("SEALED", OrderStatus.REJECTED, true, 300_000))).isFalse();
        assertThat(GiftCaseRules.giftCaseOpenable(order(null, OrderStatus.APPROVED, true, 300_000))).isFalse();
    }
}
