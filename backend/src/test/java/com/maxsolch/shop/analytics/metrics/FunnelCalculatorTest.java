package com.maxsolch.shop.analytics.metrics;

import com.maxsolch.shop.analytics.EventClassifier;
import com.maxsolch.shop.analytics.metrics.MetricsDtos.Funnel;
import com.maxsolch.shop.analytics.metrics.MetricsFacts.OrderFact;
import com.maxsolch.shop.domain.OrderStatus;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

import static com.maxsolch.shop.analytics.metrics.Fx.KYIV;
import static com.maxsolch.shop.analytics.metrics.Fx.facts;
import static com.maxsolch.shop.analytics.metrics.Fx.item;
import static com.maxsolch.shop.analytics.metrics.Fx.order;
import static com.maxsolch.shop.analytics.metrics.Fx.product;
import static org.assertj.core.api.Assertions.assertThat;

class FunnelCalculatorTest {

    private final Instant now = LocalDateTime.parse("2026-10-20T12:00:00").atZone(KYIV).toInstant();
    private final MetricsPeriod october = MetricsPeriod.parse("month", null, null, KYIV, now);
    private final LocalDate day = LocalDate.parse("2026-10-05");

    private EventClassifier.VisitorDay v(String key, int stages) {
        return new EventClassifier.VisitorDay(day, "MINIAPP", key, null, stages, 1);
    }

    @Test
    void steps_visitorsFromEvents_buyersFromOrders() {
        List<EventClassifier.VisitorDay> visitors = new ArrayList<>();
        for (int i = 0; i < 10; i++) {
            visitors.add(v("t:" + i, 1));
        }
        visitors.add(v("t:100", 1 | 2 | 4 | 8));
        visitors.add(new EventClassifier.VisitorDay(day.plusDays(1), "MINIAPP", "t:100", 100L, 1, 3)); // same person
        visitors.add(new EventClassifier.VisitorDay(day, "WEB", "a:x", null, 1 | 2, 4));               // other channel

        Instant at = LocalDateTime.parse("2026-10-05T12:00:00").atZone(KYIV).toInstant();
        OrderFact paidShipped = order(at).tg(100L).paid(at, 100_00).times(at, at, null).build();
        OrderFact rejected = order(at).tg(101L).status(OrderStatus.REJECTED).build();

        Funnel f = new FunnelCalculator(KYIV).compute(facts(now, List.of(paidShipped, rejected), List.of(), List.of()),
                october, ChannelFilter.MINIAPP, visitors, List.of(), LocalDate.parse("2026-09-17"));

        assertThat(f.steps()).extracting(MetricsDtos.FunnelStep::count).containsExactly(11L, 1L, 1L, 1L, 2L, 1L, 1L);
        assertThat(f.steps().get(1).fromStartPct()).isEqualTo(9.1);
        assertThat(f.note()).isNull();
    }

    @Test
    void journalStartingMidPeriod_orderStepsStartThereToo() {
        // Events exist from Oct 10: an order on Oct 5 must not make "ordered" exceed "started checkout".
        List<EventClassifier.VisitorDay> visitors = List.of(
                new EventClassifier.VisitorDay(LocalDate.parse("2026-10-12"), "MINIAPP", "t:7", 7L, 1 | 2 | 4 | 8, 5));
        Instant before = LocalDateTime.parse("2026-10-05T12:00:00").atZone(KYIV).toInstant();
        Instant after = LocalDateTime.parse("2026-10-12T12:00:00").atZone(KYIV).toInstant();
        OrderFact early = order(before).tg(1L).paid(before, 100_00).build();
        OrderFact late = order(after).tg(7L).paid(after, 100_00).build();

        Funnel f = new FunnelCalculator(KYIV).compute(facts(now, List.of(early, late), List.of(), List.of()),
                october, ChannelFilter.MINIAPP, visitors, List.of(), LocalDate.parse("2026-10-10"));

        assertThat(f.steps()).extracting(MetricsDtos.FunnelStep::count).containsExactly(1L, 1L, 1L, 1L, 1L, 1L, 0L);
        assertThat(f.note()).contains("2026-10-10");
    }

    @Test
    void lowConversion_listsWellViewedProductsThatDoNotSell() {
        Instant at = LocalDateTime.parse("2026-10-05T12:00:00").atZone(KYIV).toInstant();
        OrderFact o = order(at).tg(1L).build();
        List<EventClassifier.ProductDay> products = List.of(
                new EventClassifier.ProductDay(day, "MINIAPP", "looked", 50, 40, 6),
                new EventClassifier.ProductDay(day, "MINIAPP", "sells", 10, 10, 3),
                new EventClassifier.ProductDay(day, "MINIAPP", "few", 3, 3, 0));

        Funnel f = new FunnelCalculator(KYIV).compute(
                facts(now, List.of(o), List.of(item(o, "sells", 100_00, 1)),
                        List.of(product("looked", 100_00, 2, at), product("sells", 100_00, 2, at))),
                october, ChannelFilter.MINIAPP, List.of(), products, LocalDate.parse("2026-09-01"));

        assertThat(f.lowConversion()).extracting(MetricsDtos.InterestRow::productId).containsExactly("looked");
    }
}
