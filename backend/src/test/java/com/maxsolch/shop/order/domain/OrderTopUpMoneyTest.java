package com.maxsolch.shop.order.domain;

import com.maxsolch.shop.platform.util.UuidUtil;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/** Top-up of a paid online order that got more expensive (V80): the amount, the notice, наложка, waiving it. */
class OrderTopUpMoneyTest {

    /** Paid online 1450, then the admin pressed «+» at the 150 line: 1600 now. */
    private static Order paidThenGrown(OrderStatus status) {
        Order o = new Order();
        OrderFixtures.set(o, "id", UuidUtil.randomBytes());
        OrderStates.withStatus(o, status);
        OrderItem glides = new OrderItem();
        OrderFixtures.set(glides, "priceMinorSnapshot", 150_00L);
        OrderFixtures.set(glides, "quantity", 2);
        OrderItem fan = new OrderItem();
        OrderFixtures.set(fan, "priceMinorSnapshot", 1300_00L);
        OrderFixtures.set(fan, "quantity", 1);
        OrderFixtures.set(o, "items", new ArrayList<>(List.of(glides, fan)));
        OrderFixtures.set(o, "subtotalMinor", 1600_00L);
        OrderFixtures.set(o, "totalMinor", 1600_00L);
        OrderFixtures.set(o, "receivedMinor", 1450_00L);
        OrderFixtures.set(o, "paid", true);
        OrderFixtures.set(o, "paymentDueAt", Instant.parse("2026-11-05T07:43:41Z"));
        return o;
    }

    @Test
    void paidOrderThatGrew_owesTheDifference_andShippingWaitsForIt() {
        Order o = paidThenGrown(OrderStatus.APPROVED);

        assertThat(OrderMoney.topUpDueMinor(o)).isEqualTo(150_00);
        assertThat(OrderMoney.topUpNotice(o)).isEqualTo("15000:ONLINE");
        assertThat(OrderMoney.onlinePaymentMissing(o)).isTrue();
    }

    @Test
    void onDelivery_unblocksShipping_keepsTheAmountForTheCustomer_andChangesTheNotice() {
        Order o = paidThenGrown(OrderStatus.APPROVED);

        o.collectBalanceOnDelivery(true);

        assertThat(OrderMoney.onlinePaymentMissing(o)).isFalse();
        assertThat(OrderMoney.amountDueMinor(o)).isEqualTo(150_00); // may still pay online
        assertThat(OrderMoney.codMinor(o)).isEqualTo(150_00);
        assertThat(OrderMoney.topUpNotice(o)).isEqualTo("15000:COD");
    }

    @Test
    void onDelivery_doesNotUnblockAnUnpaidOrder() {
        Order o = paidThenGrown(OrderStatus.APPROVED);
        OrderFixtures.set(o, "paid", false);
        OrderFixtures.set(o, "receivedMinor", 0L);

        o.collectBalanceOnDelivery(true);

        assertThat(OrderMoney.onlinePaymentMissing(o)).isTrue();
        assertThat(OrderMoney.topUpDueMinor(o)).isZero();
    }

    @Test
    void waive_takesTheDifferenceOffAsADiscount() {
        Order o = paidThenGrown(OrderStatus.APPROVED);

        o.waiveBalance(OrderMoney.topUpDueMinor(o));

        assertThat(o.getTotalMinor()).isEqualTo(1450_00);
        assertThat(o.getDiscountMinor()).isEqualTo(150_00);
        assertThat(o.getPromoCode()).isEqualTo("Ручная скидка");
        assertThat(OrderMoney.topUpNotice(o)).isNull();
        assertThat(OrderMoney.onlinePaymentMissing(o)).isFalse();
    }

    @Test
    void waive_keepsThePromoLabel_andSurvivesARepricing() {
        Order o = paidThenGrown(OrderStatus.APPROVED);
        OrderFixtures.set(o, "promoCode", "LEVELUP");

        o.waiveBalance(150_00);
        o.reprice();

        assertThat(o.getPromoCode()).isEqualTo("LEVELUP");
        assertThat(o.getTotalMinor()).isEqualTo(1450_00);
    }

    @Test
    void noTopUp_forShippedUnpaidOrExchangeOrders() {
        assertThat(OrderMoney.topUpDueMinor(paidThenGrown(OrderStatus.SHIPPED))).isZero();
        assertThat(OrderMoney.topUpDueMinor(paidThenGrown(OrderStatus.NEW))).isEqualTo(150_00);

        Order exchange = paidThenGrown(OrderStatus.APPROVED);
        OrderFixtures.set(exchange, "exchangeOfOrderId", UuidUtil.randomBytes());
        assertThat(OrderMoney.topUpNotice(exchange)).isNull();

        Order beforeOnline = paidThenGrown(OrderStatus.APPROVED);
        OrderFixtures.set(beforeOnline, "paymentDueAt", null);
        assertThat(OrderMoney.topUpDueMinor(beforeOnline)).isZero();
    }
}
