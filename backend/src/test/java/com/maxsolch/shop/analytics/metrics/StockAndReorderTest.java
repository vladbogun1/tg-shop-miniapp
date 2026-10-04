package com.maxsolch.shop.analytics.metrics;

import com.maxsolch.shop.analytics.metrics.MetricsDtos.Reorder;
import com.maxsolch.shop.analytics.metrics.MetricsDtos.ReorderRow;
import com.maxsolch.shop.analytics.metrics.MetricsDtos.Stock;
import com.maxsolch.shop.analytics.metrics.MetricsFacts.ItemFact;
import com.maxsolch.shop.analytics.metrics.MetricsFacts.OrderFact;
import com.maxsolch.shop.analytics.metrics.MetricsFacts.VariantFact;
import com.maxsolch.shop.domain.OrderStatus;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static com.maxsolch.shop.analytics.metrics.Fx.KYIV;
import static com.maxsolch.shop.analytics.metrics.Fx.facts;
import static com.maxsolch.shop.analytics.metrics.Fx.gift;
import static com.maxsolch.shop.analytics.metrics.Fx.hidden;
import static com.maxsolch.shop.analytics.metrics.Fx.item;
import static com.maxsolch.shop.analytics.metrics.Fx.order;
import static com.maxsolch.shop.analytics.metrics.Fx.product;
import static com.maxsolch.shop.analytics.metrics.Fx.variantItem;
import static com.maxsolch.shop.analytics.metrics.Fx.withVariants;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

class StockAndReorderTest {

    private final Instant now = Instant.parse("2026-10-20T09:00:00Z");
    private final Instant longAgo = now.minus(Duration.ofDays(200));
    private final MetricsPeriod month = MetricsPeriod.parse("month", null, null, KYIV, now);

    private Instant daysAgo(double d) {
        return now.minus(Duration.ofMinutes((long) (d * 1440)));
    }

    // ------------------------------------------------------------ velocity

    @Test
    void velocity_weightsRecentWindowsMore() {
        ReorderCalculator.Sales s = new ReorderCalculator.Sales();
        s.d14 = 14;  // 1/day lately
        s.d30 = 0;
        s.d90 = 0;
        // 0.5*1 + 0.3*0 + 0.2*0 = 0.5 per day for an old product
        assertThat(ReorderCalculator.velocity(s, 365)).isCloseTo(0.5, within(1e-9));
    }

    @Test
    void velocity_dropsWindowsTheProductDidNotExistFor() {
        ReorderCalculator.Sales s = new ReorderCalculator.Sales();
        s.d14 = 7; // 10-day-old product, 7 sold
        // only the first window, 10 days covered -> 0.7/day (not diluted by 90 days of non-existence)
        assertThat(ReorderCalculator.velocity(s, 10)).isCloseTo(0.7, within(1e-9));
    }

    @Test
    void reorder_daysToZeroAndRecommendedQuantity() {
        var fast = product("fast", 1000_00, 5, longAgo);
        var slow = product("slow", 1000_00, 50, longAgo);
        List<OrderFact> orders = new ArrayList<>();
        List<ItemFact> items = new ArrayList<>();
        for (int i = 0; i < 14; i++) { // 1/day over the last 14 days, 1/day before too
            OrderFact a = order(daysAgo(i + 0.5)).build();
            OrderFact b = order(daysAgo(i + 15.5)).build();
            orders.add(a);
            orders.add(b);
            items.add(item(a, "fast", 1000_00, 1));
            items.add(item(b, "fast", 1000_00, 1));
        }
        OrderFact s1 = order(daysAgo(3)).build();
        orders.add(s1);
        items.add(item(s1, "slow", 1000_00, 1));

        Reorder r = new ReorderCalculator().compute(facts(now, orders, items, List.of(fast, slow)),
                Map.of("fast", new ReorderCalculator.Interest(40, 30, 6)), 30);

        assertThat(r.rows()).extracting(ReorderRow::productId).containsExactly("fast");
        ReorderRow row = r.rows().get(0);
        // 0.5*(14/14) + 0.3*(14/16) + 0.2*(0/60) = 0.7625/day
        assertThat(row.velocityPerDay()).isEqualTo(0.76);
        assertThat(row.daysToZero()).isEqualTo(6.6);
        assertThat(row.urgency()).isEqualTo("critical");
        assertThat(row.recommendQty()).isEqualTo(18); // ceil(0.7625*30 - 5)
        assertThat(row.views30()).isEqualTo(40);
    }

    @Test
    void reorder_isPerVariant_andIgnoresRejectedAndGifts() {
        var p = withVariants("kb", 3000_00, longAgo,
                new VariantFact("white", "Белая", 1), new VariantFact("black", "Чёрная", 20));
        OrderFact ok = order(daysAgo(2)).build();
        OrderFact rejected = order(daysAgo(2)).status(OrderStatus.REJECTED).build();
        List<ItemFact> items = List.of(
                variantItem(ok, "kb", "white", 3000_00, 3),
                variantItem(rejected, "kb", "black", 3000_00, 30),
                new ItemFact(ok.id(), "kb", "black", "kb", "Чёрная", 0, 30, true));

        Reorder r = new ReorderCalculator().compute(facts(now, List.of(ok, rejected), items, List.of(p)), Map.of(), 30);

        assertThat(r.rows()).extracting(ReorderRow::variantId).containsExactly("white");
    }

    @Test
    void missedDemand_listsHiddenOrSoldOutProductsPeopleStillWant() {
        var gone = hidden("gone", 500_00, 0, false);
        var nobody = hidden("nobody", 500_00, 0, false);

        Reorder r = new ReorderCalculator().compute(facts(now, List.of(), List.of(), List.of(gone, nobody)),
                Map.of("gone", new ReorderCalculator.Interest(25, 20, 4)), 30);

        assertThat(r.missedDemand()).extracting(MetricsDtos.DemandRow::productId).containsExactly("gone");
    }

    // ------------------------------------------------------------ stock tab

    @Test
    void deadStock_byDaysWithoutSale_newProductsAreNotDead() {
        var soldLongAgo = product("old", 100_00, 4, longAgo);
        var neverSold = product("never", 300_00, 2, longAgo);
        var fresh = product("fresh", 300_00, 5, daysAgo(10));
        var selling = product("hot", 100_00, 1, longAgo);
        OrderFact old = order(daysAgo(75)).build();
        OrderFact recent = order(daysAgo(5)).build();

        Stock s = stock(facts(now, List.of(old, recent),
                List.of(item(old, "old", 100_00, 1), item(recent, "hot", 100_00, 1)),
                List.of(soldLongAgo, neverSold, fresh, selling)), 60);

        assertThat(s.deadStock()).extracting(MetricsDtos.DeadStockRow::productId).containsExactly("never", "old");
        MetricsDtos.DeadStockRow never = s.deadStock().get(0);
        assertThat(never.neverSold()).isTrue();
        assertThat(never.valueMinor()).isEqualTo(600_00);
        assertThat(s.deadStock().get(1).daysWithoutSale()).isEqualTo(75);
        assertThat(s.deadStockBuckets()).extracting(MetricsDtos.DeadStockBucket::products).containsExactly(2L, 2L, 1L);
        assertThat(s.kpis().deadStockMinor()).isEqualTo(1000_00);
    }

    @Test
    void forgottenStock_isHiddenOrArchivedWithUnits() {
        Stock s = stock(facts(now, List.of(), List.of(), List.of(hidden("h", 100_00, 3, false),
                hidden("a", 100_00, 2, true), hidden("empty", 100_00, 0, false))), 60);

        assertThat(s.forgotten()).extracting(MetricsDtos.ForgottenRow::productId).containsExactlyInAnyOrder("h", "a");
        assertThat(s.kpis().forgottenMinor()).isEqualTo(500_00);
        assertThat(s.kpis().stockValueMinor()).isZero();
    }

    @Test
    void stockValueAndDaysOfCover_atRetail() {
        var p = product("p", 100_00, 30, longAgo);
        OrderFact o = order(daysAgo(10)).build();
        // sold 30 units in the last 30 days -> 1 unit (100 UAH)/day; 30 units in stock -> 30 days
        Stock s = stock(facts(now, List.of(o), List.of(item(o, "p", 100_00, 30)), List.of(p)), 60);

        assertThat(s.kpis().stockValueMinor()).isEqualTo(3000_00);
        assertThat(s.kpis().daysOfCover()).isEqualTo(30.0);
    }

    @Test
    void topProducts_byProductId_currentTitle_withoutRejectedAndGifts() {
        var p = product("p", 100_00, 3, longAgo);
        OrderFact a = order(daysAgo(1)).discount(200_00, 20_00).build();
        OrderFact b = order(daysAgo(2)).build();
        OrderFact rejected = order(daysAgo(2)).status(OrderStatus.REJECTED).build();
        List<ItemFact> items = List.of(
                new ItemFact(a.id(), "p", null, "Старое название", null, 100_00, 2, false),
                new ItemFact(b.id(), "p", null, "Новое название", null, 100_00, 1, false),
                item(rejected, "p", 100_00, 10),
                gift(b, "p", 5));

        Stock s = stock(facts(now, List.of(a, b, rejected), items, List.of(p)), 60);

        assertThat(s.topProducts()).singleElement().satisfies(t -> {
            assertThat(t.title()).isEqualTo("Товар p");
            assertThat(t.units()).isEqualTo(3);
            assertThat(t.revenueMinor()).isEqualTo(280_00); // 180 after 10% off + 100
            assertThat(t.orders()).isEqualTo(2);
        });
    }

    private Stock stock(MetricsFacts f, int deadDays) {
        Reorder r = new ReorderCalculator().compute(f, Map.of(), 30);
        return new StockCalculator().compute(f, month, ChannelFilter.ALL, deadDays, Map.of(), r);
    }
}
