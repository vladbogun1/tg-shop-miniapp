package com.maxsolch.shop.analytics.metrics;

import com.maxsolch.shop.analytics.metrics.MetricsDtos.Operations;
import com.maxsolch.shop.analytics.metrics.MetricsDtos.Overview;
import com.maxsolch.shop.analytics.metrics.MetricsDtos.SchemeRow;
import com.maxsolch.shop.analytics.metrics.MetricsFacts.OrderFact;
import com.maxsolch.shop.analytics.metrics.MetricsFacts.PaymentScheme;
import com.maxsolch.shop.domain.OrderStatus;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

import static com.maxsolch.shop.analytics.metrics.Fx.KYIV;
import static com.maxsolch.shop.analytics.metrics.Fx.facts;
import static com.maxsolch.shop.analytics.metrics.Fx.invoice;
import static com.maxsolch.shop.analytics.metrics.Fx.order;
import static org.assertj.core.api.Assertions.assertThat;

/** Metrics after monobank acquiring (v3.9.0): old manual transfers and online payments side by side. */
class OnlinePaymentMetricsTest {

    private final Instant now = kyiv("2026-10-20T12:00:00");
    private final MetricsPeriod october = MetricsPeriod.parse("month", null, null, KYIV, now);
    private final OverviewCalculator calc = new OverviewCalculator(KYIV);

    private static Instant kyiv(String local) {
        return LocalDateTime.parse(local).atZone(KYIV).toInstant();
    }

    @Test
    void scheme_tellsOldTransfersFromMonobank() {
        Instant t = kyiv("2026-10-05T10:00:00");
        assertThat(order(t).build().scheme()).isEqualTo(PaymentScheme.NONE);
        assertThat(order(t).payment("Полная оплата на счет ФОП").build().scheme()).isEqualTo(PaymentScheme.CARD_FULL);
        assertThat(order(t).payment("Передоплата 100 грн").prepayment(100_00).build().scheme())
                .isEqualTo(PaymentScheme.CARD_PREPAY);
        assertThat(order(t).payment("Полная оплата онлайн").online(0).build().scheme())
                .isEqualTo(PaymentScheme.ONLINE_FULL);
        assertThat(order(t).payment("Предоплата 100 грн онлайн").online(100_00).build().scheme())
                .isEqualTo(PaymentScheme.ONLINE_PREPAY);
    }

    @Test
    void unpaidOnlineOrder_isNotSoldYet_andATimeoutIsNotARejection() {
        OrderFact paid = order(kyiv("2026-10-10T10:00:00")).status(OrderStatus.NEW).total(1000_00).online(0)
                .paidOnline(kyiv("2026-10-10T10:05:00"), 1000_00).build();
        OrderFact waiting = order(kyiv("2026-10-20T09:00:00")).status(OrderStatus.NEW).total(700_00).online(0).build();
        OrderFact timedOut = order(kyiv("2026-10-11T10:00:00")).total(500_00).online(0)
                .rejectedAt(kyiv("2026-10-12T10:00:00")).reason("Не оплачен", "PAYMENT_TIMEOUT").build();
        OrderFact rejected = order(kyiv("2026-10-12T10:00:00")).total(300_00).online(100_00)
                .rejectedAt(kyiv("2026-10-12T12:00:00")).reason("нет в наличии", "OUT_OF_STOCK").build();

        Overview o = calc.compute(facts(now, List.of(paid, waiting, timedOut, rejected), List.of(), List.of()),
                october, ChannelFilter.ALL, Map.of());

        assertThat(o.kpis().soldMinor().value()).isEqualTo(1000_00);
        assertThat(o.kpis().orders().value()).isEqualTo(1);
        // 1 rejection of 2 decided orders; the expired checkout and the waiting one stay out
        assertThat(o.kpis().rejectRatePct().value()).isEqualTo(50.0);
        assertThat(o.money().awaitingPaymentOrders()).isEqualTo(1);
        assertThat(o.money().awaitingPaymentMinor()).isEqualTo(700_00);
        assertThat(o.money().awaitingPaymentConfirm()).isEqualTo(1);
        assertThat(o.online().orders()).isEqualTo(4);
        assertThat(o.online().paidOrders()).isEqualTo(1);
        assertThat(o.online().awaiting()).isEqualTo(1);
        assertThat(o.online().timedOut()).isEqualTo(1);
        // paid 1 of the 3 decided online orders
        assertThat(o.online().conversionPct()).isEqualTo(33.3);
        assertThat(o.online().prepayOrders()).isEqualTo(1);
        assertThat(o.online().fullOrders()).isEqualTo(3);
    }

    @Test
    void approvedUnpaidOnlineOrder_isASale_theAdminTookIt() {
        OrderFact approved = order(kyiv("2026-10-10T10:00:00")).status(OrderStatus.APPROVED).total(400_00).online(0)
                .build();
        assertThat(approved.awaitingPayment()).isFalse();
        assertThat(approved.sold()).isTrue();
    }

    @Test
    void prepayment_isMoneyAtPayment_codRestAtDelivery() {
        // monobank 100 грн in September, parcel collected in October: 100 in September, 900 in October
        OrderFact mono = order(kyiv("2026-09-28T10:00:00")).total(1000_00).online(100_00)
                .paidOnline(kyiv("2026-09-28T10:05:00"), 100_00).delivered(kyiv("2026-10-03T15:00:00")).build();
        // the old manual prepayment works the same way (prepayment snapshot)
        OrderFact card = order(kyiv("2026-09-29T10:00:00")).total(500_00).prepayment(100_00)
                .paid(kyiv("2026-09-29T11:00:00"), 100_00).delivered(kyiv("2026-10-04T15:00:00")).build();
        // full payment: everything at the payment date
        OrderFact full = order(kyiv("2026-09-30T10:00:00")).total(300_00).online(0)
                .paidOnline(kyiv("2026-09-30T10:01:00"), 300_00).delivered(kyiv("2026-10-05T15:00:00")).build();

        assertThat(mono.receivedParts()).containsExactly(100_00, 900_00);
        Overview o = calc.compute(facts(now, List.of(mono, card, full), List.of(), List.of()),
                october, ChannelFilter.ALL, Map.of());

        assertThat(o.kpis().receivedMinor().value()).isEqualTo(900_00 + 400_00);
        assertThat(OverviewCalculator.totals(List.of(mono, card, full), ChannelFilter.ALL,
                kyiv("2026-09-01T00:00:00"), kyiv("2026-10-01T00:00:00")).received())
                .isEqualTo(100_00 + 100_00 + 300_00);
        assertThat(o.series()).filteredOn(p -> p.bucket().equals("2026-10-03"))
                .singleElement().satisfies(p -> assertThat(p.receivedMinor()).isEqualTo(900_00));
    }

    @Test
    void monobankRefund_isSubtractedAtItsDate() {
        OrderFact cancelled = order(kyiv("2026-10-05T10:00:00")).total(800_00).online(0)
                .paidOnline(kyiv("2026-10-05T10:05:00"), 800_00).rejectedAt(kyiv("2026-10-06T10:00:00"))
                .reason("Отменён покупателем", "CHANGED_MIND").refundOnline(kyiv("2026-10-07T10:00:00"), 800_00).build();

        Overview o = calc.compute(facts(now, List.of(cancelled), List.of(), List.of()),
                october, ChannelFilter.ALL, Map.of());

        assertThat(o.kpis().receivedMinor().value()).isZero();
        assertThat(o.kpis().soldMinor().value()).isZero();
        assertThat(o.money().refundedMinor()).isEqualTo(800_00);
        assertThat(o.series()).filteredOn(p -> p.bucket().equals("2026-10-07"))
                .singleElement().satisfies(p -> assertThat(p.receivedMinor()).isEqualTo(-800_00));
    }

    @Test
    void schemes_splitOldAndNewOrders() {
        OrderFact oldFull = order(kyiv("2026-10-02T10:00:00")).payment("Полная оплата на счет ФОП").total(500_00)
                .paid(kyiv("2026-10-02T11:00:00"), 500_00).build();
        OrderFact oldPrepay = order(kyiv("2026-10-03T10:00:00")).payment("Передоплата 100 грн").prepayment(100_00)
                .status(OrderStatus.SHIPPED).total(900_00).paid(kyiv("2026-10-03T11:00:00"), 100_00).build();
        OrderFact monoFull = order(kyiv("2026-10-08T10:00:00")).payment("Полная оплата онлайн").online(0)
                .status(OrderStatus.NEW).total(400_00).paidOnline(kyiv("2026-10-08T10:02:00"), 400_00).build();
        OrderFact monoTimeout = order(kyiv("2026-10-09T10:00:00")).payment("Полная оплата онлайн").online(0)
                .total(250_00).rejectedAt(kyiv("2026-10-10T10:00:00")).reason("x", "PAYMENT_TIMEOUT").build();

        Overview o = calc.compute(facts(now, List.of(oldFull, oldPrepay, monoFull, monoTimeout), List.of(), List.of()),
                october, ChannelFilter.ALL, Map.of());

        assertThat(o.schemes()).extracting(SchemeRow::key)
                .containsExactly("ONLINE_FULL", "CARD_FULL", "CARD_PREPAY");
        SchemeRow mono = o.schemes().get(0);
        assertThat(mono.online()).isTrue();
        assertThat(mono.orders()).isEqualTo(1);
        assertThat(mono.soldMinor()).isEqualTo(400_00);
        assertThat(mono.receivedMinor()).isEqualTo(400_00);
        assertThat(mono.timedOut()).isEqualTo(1);
        SchemeRow prepay = o.schemes().get(2);
        assertThat(prepay.soldMinor()).isEqualTo(900_00);
        assertThat(prepay.receivedMinor()).isEqualTo(100_00);
    }

    @Test
    void invoices_createdPaidFailed_feeAndRefunds() {
        OrderFact a = order(kyiv("2026-10-08T10:00:00")).online(0).status(OrderStatus.NEW).total(400_00)
                .paidOnline(kyiv("2026-10-08T10:30:00"), 400_00).build();
        OrderFact b = order(kyiv("2026-10-09T10:00:00")).online(0).total(250_00)
                .rejectedAt(kyiv("2026-10-10T10:00:00")).reason("x", "PAYMENT_TIMEOUT").build();
        var expired = invoice(a, "expired", 400_00, kyiv("2026-10-08T10:00:00"), null);
        var paid = invoice(a, "success", 400_00, kyiv("2026-10-08T10:20:00"), kyiv("2026-10-08T10:30:00"));
        var failed = invoice(b, "failure", 250_00, kyiv("2026-10-09T10:00:00"), null);

        Overview o = calc.compute(facts(now, List.of(a, b), List.of(expired, paid, failed)),
                october, ChannelFilter.ALL, Map.of());

        assertThat(o.online().invoices()).isEqualTo(3);
        assertThat(o.online().invoicesPaid()).isEqualTo(1);
        assertThat(o.online().invoicesFailed()).isEqualTo(2);
        assertThat(o.online().paidMinor()).isEqualTo(400_00);
        assertThat(o.online().feeMinor()).isEqualTo(4_00);
        assertThat(o.online().since()).isEqualTo(a.createdAt());
    }

    @Test
    void noOnlineOrdersYet_meansAnEmptyBlock() {
        OrderFact old = order(kyiv("2026-10-02T10:00:00")).payment("Полная оплата на счет ФОП").build();
        Overview o = calc.compute(facts(now, List.of(old), List.of(), List.of()), october, ChannelFilter.ALL, Map.of());
        assertThat(o.online().since()).isNull();
        assertThat(o.online().orders()).isZero();
        assertThat(o.online().conversionPct()).isNull();
    }

    @Test
    void operations_keepTimeoutsOutOfTheRejectRate_butListTheReason() {
        OrderFact ok = order(kyiv("2026-10-05T10:00:00")).build();
        OrderFact rejected = order(kyiv("2026-10-05T11:00:00")).rejectedAt(kyiv("2026-10-05T12:00:00"))
                .reason("нет", "OUT_OF_STOCK").build();
        OrderFact timedOut = order(kyiv("2026-10-06T10:00:00")).online(0).rejectedAt(kyiv("2026-10-07T10:00:00"))
                .reason("x", "PAYMENT_TIMEOUT").build();
        OrderFact waiting = order(kyiv("2026-10-20T10:00:00")).status(OrderStatus.NEW).online(0).build();

        Operations op = new OperationsCalculator().compute(facts(now, List.of(ok, rejected, timedOut, waiting),
                List.of(), List.of()), october, ChannelFilter.ALL, true, List.of());

        assertThat(op.rejects().rejected()).isEqualTo(1);
        assertThat(op.rejects().total()).isEqualTo(2);
        assertThat(op.rejects().ratePct()).isEqualTo(50.0);
        assertThat(op.rejects().timedOut()).isEqualTo(1);
        assertThat(op.rejects().byReason()).extracting(MetricsDtos.CountRow::key)
                .contains("OUT_OF_STOCK", "PAYMENT_TIMEOUT");
    }

    @Test
    void customers_andForecast_ignoreUnpaidOnlineOrders() {
        OrderFact waiting = order(kyiv("2026-10-20T09:00:00")).status(OrderStatus.NEW).online(0).tg(77L).build();
        var c = new CustomerCalculator(KYIV).compute(facts(now, List.of(waiting), List.of(), List.of()),
                october, ChannelFilter.ALL);
        assertThat(c.kpis().buyers().value()).isZero();
    }
}
