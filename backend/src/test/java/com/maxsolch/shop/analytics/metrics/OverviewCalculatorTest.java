package com.maxsolch.shop.analytics.metrics;

import com.maxsolch.shop.analytics.metrics.MetricsDtos.CategoryRow;
import com.maxsolch.shop.analytics.metrics.MetricsDtos.Overview;
import com.maxsolch.shop.analytics.metrics.MetricsFacts.OrderFact;
import com.maxsolch.shop.domain.OrderStatus;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

import static com.maxsolch.shop.analytics.metrics.Fx.KYIV;
import static com.maxsolch.shop.analytics.metrics.Fx.facts;
import static com.maxsolch.shop.analytics.metrics.Fx.gift;
import static com.maxsolch.shop.analytics.metrics.Fx.item;
import static com.maxsolch.shop.analytics.metrics.Fx.order;
import static com.maxsolch.shop.analytics.metrics.Fx.product;
import static org.assertj.core.api.Assertions.assertThat;

class OverviewCalculatorTest {

    private final Instant now = kyiv("2026-10-20T12:00:00");
    private final MetricsPeriod october = MetricsPeriod.parse("month", null, null, KYIV, now);
    private final OverviewCalculator calc = new OverviewCalculator(KYIV);

    private static Instant kyiv(String local) {
        return LocalDateTime.parse(local).atZone(KYIV).toInstant();
    }

    @Test
    void sold_countsEveryNotRejectedOrderByCreationDate_notOnlyDelivered() {
        OrderFact shipped = order(kyiv("2026-10-18T10:00:00")).status(OrderStatus.SHIPPED).total(500_00).build();
        OrderFact approved = order(kyiv("2026-10-19T10:00:00")).status(OrderStatus.APPROVED).total(300_00).build();
        OrderFact rejected = order(kyiv("2026-10-19T11:00:00")).status(OrderStatus.REJECTED).total(999_00).build();

        Overview o = calc.compute(facts(now, List.of(shipped, approved, rejected), List.of(), List.of()),
                october, ChannelFilter.ALL, Map.of());

        assertThat(o.kpis().soldMinor().value()).isEqualTo(800_00);
        assertThat(o.kpis().orders().value()).isEqualTo(2);
        assertThat(o.kpis().aovMinor().value()).isEqualTo(400_00);
        assertThat(o.kpis().rejectRatePct().value()).isEqualTo(33.3);
        // the tail of the series is not empty just because the parcels are still travelling
        assertThat(o.series()).filteredOn(p -> p.bucket().equals("2026-10-19"))
                .singleElement().satisfies(p -> {
                    assertThat(p.soldMinor()).isEqualTo(300_00);
                    assertThat(p.rejected()).isEqualTo(1);
                });
    }

    @Test
    void received_isByPaymentDate_minusRefundsByReturnDate() {
        // created in September, paid in October -> counts as October money
        OrderFact paidLate = order(kyiv("2026-09-28T10:00:00")).paid(kyiv("2026-10-02T10:00:00"), 1000_00).build();
        // paid and refunded in October
        OrderFact refunded = order(kyiv("2026-10-03T10:00:00")).status(OrderStatus.REJECTED)
                .paid(kyiv("2026-10-03T12:00:00"), 400_00).refund(kyiv("2026-10-05T12:00:00"), 400_00).build();

        Overview o = calc.compute(facts(now, List.of(paidLate, refunded), List.of(), List.of()),
                october, ChannelFilter.ALL, Map.of());

        assertThat(o.kpis().receivedMinor().value()).isEqualTo(1000_00);
        assertThat(o.money().refundedMinor()).isEqualTo(400_00);
    }

    @Test
    void received_withoutAPaymentDate_isBookedAtDelivery_notLost() {
        // Received amount set, no paid_at (old / hand-edited row): it used to vanish from "Получено".
        OrderFact o = new OrderFact("x", OrderStatus.DELIVERED, "MINIAPP", 700_00, 0, 0, 700_00, 0,
                kyiv("2026-10-01T10:00:00"), null, null, kyiv("2026-10-04T10:00:00"), null, null, null, true,
                1L, "Покупатель", "u", null, null, null, null, null);

        Overview ov = calc.compute(facts(now, List.of(o), List.of(), List.of()), october, ChannelFilter.ALL, Map.of());

        assertThat(ov.kpis().receivedMinor().value()).isEqualTo(700_00);
        assertThat(ov.series()).filteredOn(p -> p.bucket().equals("2026-10-04"))
                .singleElement().satisfies(p -> assertThat(p.receivedMinor()).isEqualTo(700_00));
    }

    @Test
    void codInTransit_andPaidOrdersAwaitingTheAdmin() {
        OrderFact shippedCod = order(kyiv("2026-10-10T10:00:00")).status(OrderStatus.SHIPPED).total(2000_00)
                .paid(kyiv("2026-10-10T11:00:00"), 100_00).build();
        OrderFact paidNew = order(kyiv("2026-10-11T10:00:00")).status(OrderStatus.NEW)
                .paid(kyiv("2026-10-11T10:05:00"), 100_00).build();
        OrderFact unpaidNew = order(kyiv("2026-10-11T10:00:00")).status(OrderStatus.NEW).build();
        OrderFact paidButRejected = order(kyiv("2026-10-11T10:00:00")).status(OrderStatus.REJECTED)
                .paid(kyiv("2026-10-11T10:05:00"), 100_00).build();

        Overview o = calc.compute(facts(now, List.of(shippedCod, paidNew, unpaidNew, paidButRejected), List.of(), List.of()),
                october, ChannelFilter.ALL, Map.of());

        assertThat(o.money().codInTransitMinor()).isEqualTo(1900_00);
        assertThat(o.money().codInTransitOrders()).isEqualTo(1);
        assertThat(o.money().awaitingPaymentConfirm()).isEqualTo(1);
    }

    @Test
    void comparison_withPreviousPeriod() {
        OrderFact now1 = order(kyiv("2026-10-05T10:00:00")).total(300_00).build();
        OrderFact prev1 = order(kyiv("2026-09-05T10:00:00")).total(200_00).build();

        Overview o = calc.compute(facts(now, List.of(now1, prev1), List.of(), List.of()),
                october, ChannelFilter.ALL, Map.of());

        assertThat(o.kpis().soldMinor().prev()).isEqualTo(200_00);
        assertThat(o.kpis().soldMinor().changePct()).isEqualTo(50.0);
    }

    @Test
    void channelFilter_keepsOnlyThatSource() {
        OrderFact app = order(kyiv("2026-10-05T10:00:00")).total(300_00).build();
        OrderFact web = order(kyiv("2026-10-05T11:00:00")).source("WEB").total(700_00).tg(2L).build();

        Overview o = calc.compute(facts(now, List.of(app, web), List.of(), List.of()),
                october, ChannelFilter.WEB, Map.of("WEB", 10L));

        assertThat(o.kpis().soldMinor().value()).isEqualTo(700_00);
        // the channel table always shows both, with conversion from visitors
        assertThat(o.channels()).extracting(MetricsDtos.ChannelRow::source).containsExactly("MINIAPP", "WEB");
        assertThat(o.channels().get(1).conversionPct()).isEqualTo(10.0);
    }

    @Test
    void categories_excludeRejectedAndGifts_andApplyTheDiscountShare() {
        OrderFact ok = order(kyiv("2026-10-05T10:00:00")).discount(1000_00, 100_00).build();
        OrderFact rejected = order(kyiv("2026-10-05T10:00:00")).status(OrderStatus.REJECTED).build();
        var mice = product("p1", 500_00, 3, kyiv("2026-01-01T00:00:00"), "Мышки");
        var pads = product("p2", 500_00, 3, kyiv("2026-01-01T00:00:00"), "Коврики");
        var untagged = product("p3", 100_00, 1, kyiv("2026-01-01T00:00:00"));

        Overview o = calc.compute(facts(now, List.of(ok, rejected),
                        List.of(item(ok, "p1", 500_00, 2), gift(ok, "p2", 1), item(rejected, "p2", 500_00, 5)),
                        List.of(mice, pads, untagged)),
                october, ChannelFilter.ALL, Map.of());

        CategoryRow miceRow = o.categories().stream().filter(c -> c.name().equals("Мышки")).findFirst().orElseThrow();
        assertThat(miceRow.units()).isEqualTo(2);
        assertThat(miceRow.revenueMinor()).isEqualTo(900_00); // 1000 at a 10% discount
        assertThat(miceRow.sharePct()).isEqualTo(100.0);
        CategoryRow padsRow = o.categories().stream().filter(c -> c.name().equals("Коврики")).findFirst().orElseThrow();
        assertThat(padsRow.units()).isZero();
        assertThat(padsRow.liveProducts()).isEqualTo(1);
        assertThat(o.categories()).extracting(CategoryRow::name).contains(OverviewCalculator.NO_CATEGORY);
    }

    @Test
    void giveaways_discountsAndGiftsAtRetail() {
        OrderFact ok = order(kyiv("2026-10-05T10:00:00")).discount(1000_00, 150_00).promo("SALE").build();
        var glides = product("g", 80_00, 10, kyiv("2026-01-01T00:00:00"));

        Overview o = calc.compute(facts(now, List.of(ok), List.of(gift(ok, "g", 2)), List.of(glides)),
                october, ChannelFilter.ALL, Map.of());

        assertThat(o.giveaways().discountMinor()).isEqualTo(150_00);
        assertThat(o.giveaways().promoOrders()).isEqualTo(1);
        assertThat(o.giveaways().giftUnits()).isEqualTo(2);
        assertThat(o.giveaways().giftValueMinor()).isEqualTo(160_00);
    }

    @Test
    void heatmap_usesKyivWeekdayAndHour() {
        // Monday 2026-10-05 00:30 Kyiv = Sunday 21:30 UTC
        OrderFact late = order(kyiv("2026-10-05T00:30:00")).build();

        Overview o = calc.compute(facts(now, List.of(late), List.of(), List.of()), october, ChannelFilter.ALL, Map.of());

        assertThat(o.heatmap()[0][0]).isEqualTo(1);
    }
}
