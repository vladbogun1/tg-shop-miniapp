package com.maxsolch.shop.analytics.metrics;

import com.maxsolch.shop.analytics.metrics.MetricsDtos.CohortRow;
import com.maxsolch.shop.analytics.metrics.MetricsDtos.Customers;
import com.maxsolch.shop.analytics.metrics.MetricsDtos.Operations;
import com.maxsolch.shop.analytics.metrics.MetricsDtos.SpeedRow;
import com.maxsolch.shop.analytics.metrics.MetricsFacts.OrderFact;
import com.maxsolch.shop.domain.OrderStatus;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

import static com.maxsolch.shop.analytics.metrics.Fx.KYIV;
import static com.maxsolch.shop.analytics.metrics.Fx.facts;
import static com.maxsolch.shop.analytics.metrics.Fx.order;
import static org.assertj.core.api.Assertions.assertThat;

class CustomersAndOperationsTest {

    private final Instant now = kyiv("2026-10-20T12:00:00");
    private final MetricsPeriod october = MetricsPeriod.parse("month", null, null, KYIV, now);

    private static Instant kyiv(String local) {
        return LocalDateTime.parse(local).atZone(KYIV).toInstant();
    }

    // ------------------------------------------------------------ customers

    @Test
    void newAndRepeatBuyers_rejectedOrdersDoNotMakeABuyer() {
        OrderFact oldTimer1 = order(kyiv("2026-08-10T10:00:00")).tg(1L).build();
        OrderFact oldTimer2 = order(kyiv("2026-10-02T10:00:00")).tg(1L).build();
        OrderFact newcomer = order(kyiv("2026-10-03T10:00:00")).tg(2L).build();
        OrderFact twiceNow1 = order(kyiv("2026-10-04T10:00:00")).tg(3L).build();
        OrderFact twiceNow2 = order(kyiv("2026-10-05T10:00:00")).tg(3L).build();
        OrderFact onlyRejected = order(kyiv("2026-10-05T10:00:00")).tg(4L).status(OrderStatus.REJECTED).build();

        Customers c = new CustomerCalculator(KYIV).compute(
                facts(now, List.of(oldTimer1, oldTimer2, newcomer, twiceNow1, twiceNow2, onlyRejected), List.of(), List.of()),
                october, ChannelFilter.ALL);

        assertThat(c.kpis().buyers().value()).isEqualTo(3);
        assertThat(c.kpis().newBuyers().value()).isEqualTo(2);  // 2 and 3
        assertThat(c.kpis().repeatBuyers()).isEqualTo(2);       // 1 (bought before) and 3 (twice now)
        assertThat(c.repeatDistribution()).extracting(MetricsDtos.RepeatBucket::buyers).containsExactly(1L, 2L, 0L, 0L);
    }

    @Test
    void cohorts_shareReturningInLaterMonths_futureMonthsAreNull() {
        OrderFact a1 = order(kyiv("2026-08-03T10:00:00")).tg(1L).build();
        OrderFact a2 = order(kyiv("2026-09-03T10:00:00")).tg(1L).build();
        OrderFact b1 = order(kyiv("2026-08-04T10:00:00")).tg(2L).build();

        Customers c = new CustomerCalculator(KYIV).compute(facts(now, List.of(a1, a2, b1), List.of(), List.of()),
                october, ChannelFilter.ALL);

        CohortRow aug = c.cohorts().get(0);
        assertThat(aug.month()).isEqualTo("2026-08");
        assertThat(aug.buyers()).isEqualTo(2);
        assertThat(aug.returnedPct().get(0)).isEqualTo(50.0); // September
        assertThat(aug.returnedPct().get(1)).isEqualTo(0.0);  // October (running)
        assertThat(aug.returnedPct().get(2)).isNull();        // November: not yet
    }

    @Test
    void aovBuckets_andPromoCodes() {
        OrderFact small = order(kyiv("2026-10-02T10:00:00")).total(300_00).build();
        OrderFact big = order(kyiv("2026-10-02T10:00:00")).tg(2L).discount(5000_00, 500_00).promo("vip").build();

        Customers c = new CustomerCalculator(KYIV).compute(facts(now, List.of(small, big), List.of(), List.of()),
                october, ChannelFilter.ALL);

        assertThat(c.aovBuckets().get(0).orders()).isEqualTo(1);
        assertThat(c.aovBuckets().get(3).orders()).isEqualTo(1); // 4500 UAH in 3000–6000
        assertThat(c.promoCodes()).singleElement().satisfies(p -> {
            assertThat(p.code()).isEqualTo("VIP");
            assertThat(p.discountMinor()).isEqualTo(500_00);
            assertThat(p.newBuyers()).isEqualTo(1);
        });
    }

    // ------------------------------------------------------------ operations

    @Test
    void speed_isMedianAndP90_notTheAverage() {
        List<OrderFact> orders = new ArrayList<>();
        Instant base = kyiv("2026-10-02T10:00:00");
        for (int i = 0; i < 9; i++) { // nine approved in 10 minutes
            orders.add(order(base).times(base.plus(Duration.ofMinutes(10)), null, null).build());
        }
        orders.add(order(base).times(base.plus(Duration.ofHours(30)), null, null).build()); // one forgotten

        Operations o = new OperationsCalculator().compute(facts(now, orders, List.of(), List.of()), october,
                ChannelFilter.ALL, false, List.of());

        SpeedRow approve = o.speed().get(0);
        assertThat(approve.medianHours()).isEqualTo(0.17);
        assertThat(approve.count()).isEqualTo(10);
        assertThat(approve.p90Hours()).isGreaterThan(0.17); // interpolated towards the outlier
    }

    @Test
    void rejects_byCode_withUnspecifiedForHistoricalNulls() {
        OrderFact a = order(kyiv("2026-10-02T10:00:00")).status(OrderStatus.REJECTED).reason("игнор", "NO_RESPONSE").build();
        OrderFact b = order(kyiv("2026-10-02T10:00:00")).status(OrderStatus.REJECTED).reason("старый текст", null).build();
        OrderFact c = order(kyiv("2026-10-02T10:00:00")).build();

        Operations o = new OperationsCalculator().compute(facts(now, List.of(a, b, c), List.of(), List.of()), october,
                ChannelFilter.ALL, true, List.of());

        assertThat(o.rejects().ratePct()).isEqualTo(66.7);
        assertThat(o.rejects().byReason()).extracting(MetricsDtos.CountRow::label)
                .containsExactlyInAnyOrder("Не ответил", "Не указано");
    }

    @Test
    void rejects_beforeTheCodeColumn_groupNormalisedText_andFlagMoneyKept() {
        OrderFact a = order(kyiv("2026-10-02T10:00:00")).status(OrderStatus.REJECTED).reason("Игнор!", null)
                .paid(kyiv("2026-10-02T11:00:00"), 100_00).build();
        OrderFact b = order(kyiv("2026-10-02T10:00:00")).status(OrderStatus.REJECTED).reason(" игнор ", null).build();
        OrderFact c = order(kyiv("2026-10-02T10:00:00")).status(OrderStatus.REJECTED).reason("-", null).build();

        Operations o = new OperationsCalculator().compute(facts(now, List.of(a, b, c), List.of(), List.of()), october,
                ChannelFilter.ALL, false, List.of());

        assertThat(o.rejects().byReason()).anySatisfy(r -> {
            assertThat(r.key()).isEqualTo("игнор");
            assertThat(r.count()).isEqualTo(2);
        });
        assertThat(o.rejects().byReason()).anySatisfy(r -> assertThat(r.label()).isEqualTo("Не указано"));
        assertThat(o.rejects().paidNotRefundedMinor()).isEqualTo(100_00);
    }

    @Test
    void paymentOptions_haveAnUnspecifiedBucket_andStuckOrdersAreListed() {
        OrderFact noTitle = order(kyiv("2026-10-02T10:00:00")).build();
        OrderFact titled = order(kyiv("2026-10-02T10:00:00")).payment("Предоплата").build();
        OrderFact stuck = order(kyiv("2026-10-02T10:00:00")).status(OrderStatus.APPROVED)
                .times(kyiv("2026-10-18T10:00:00"), null, null).build();

        Operations o = new OperationsCalculator().compute(facts(now, List.of(noTitle, titled, stuck), List.of(), List.of()),
                october, ChannelFilter.ALL, false, List.of());

        assertThat(o.paymentOptions()).extracting(MetricsDtos.CountRow::label).contains("Не указано", "Предоплата");
        assertThat(o.approvedNotShipped()).singleElement().satisfies(v -> assertThat(v.hours()).isEqualTo(50.0));
    }
}
