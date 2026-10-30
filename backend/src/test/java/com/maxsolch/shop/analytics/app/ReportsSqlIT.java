package com.maxsolch.shop.analytics.app;

import com.maxsolch.shop.analytics.domain.EventClassifier;
import com.maxsolch.shop.analytics.domain.StructuredEvents;

import com.maxsolch.shop.analytics.app.AdminMetricsService;
import com.maxsolch.shop.analytics.domain.ChannelFilter;
import com.maxsolch.shop.analytics.app.MetricsDtos;
import com.maxsolch.shop.analytics.domain.MetricsFacts;
import com.maxsolch.shop.analytics.app.MetricsFactsLoader;
import com.maxsolch.shop.analytics.domain.MetricsPeriod;
import com.maxsolch.shop.analytics.app.ReturnsReport;
import com.maxsolch.shop.catalog.domain.Product;
import com.maxsolch.shop.finance.app.MarginService;
import com.maxsolch.shop.it.AbstractMysqlIT;
import com.maxsolch.shop.order.app.Checkout;
import com.maxsolch.shop.order.app.OrderLifecycle;
import com.maxsolch.shop.order.app.OrderPayments;
import com.maxsolch.shop.order.domain.Order;
import com.maxsolch.shop.platform.util.UuidUtil;
import com.maxsolch.shop.procurement.app.CostingDtos.MarginReportDto;
import com.maxsolch.shop.procurement.app.CostingDtos.OrderProfitDto;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Characterisation of the SQL behind the analytics and finance reports (architecture step 7): fixed history in
 * March 2001 (no other test writes there) is read through the real tables, so the numbers survive moving the SQL
 * into {@code infra} classes. Frozen on the code as it was before the move.
 */
class ReportsSqlIT extends AbstractMysqlIT {

    private static final ZoneId KYIV = ZoneId.of("Europe/Kyiv");
    private static final LocalDate D10 = LocalDate.of(2001, 3, 10);
    private static final LocalDate D11 = LocalDate.of(2001, 3, 11);
    private static final LocalDate D12 = LocalDate.of(2001, 3, 12);
    private static final LocalDate D13 = LocalDate.of(2001, 3, 13);

    @Autowired AnalyticsAggregationService aggregation;
    @Autowired AnalyticsReader reader;
    @Autowired MetricsFactsLoader loader;
    @Autowired AdminMetricsService metrics;
    @Autowired ReturnsReport returnsReport;
    @Autowired MarginService margin;
    @Autowired StaffVisitors staffVisitors;
    @Autowired Checkout orders;
    @Autowired OrderLifecycle lifecycle;
    @Autowired OrderPayments orderPayments;

    private static Instant at(LocalDate day, int hour) {
        return day.atTime(hour, 0).atZone(KYIV).toInstant();
    }

    @BeforeEach
    void clean() {
        jdbc.update("delete from client_events where created_at < '2002-01-01'");
        jdbc.update("delete from analytics_daily_visitors where day < '2002-01-01'");
        jdbc.update("delete from analytics_daily where day < '2002-01-01'");
        jdbc.update("delete from analytics_daily_runs where day < '2002-01-01'");
    }

    private void event(String channel, Long tg, String anon, String session, String event, String target,
                       UUID product, Instant when) {
        jdbc.update("insert into client_events (channel, telegram_user_id, anon_id, session_id, event, target, path, "
                        + "meta, product_id, client_time, created_at) values (?,?,?,?,?,?,?,?,?,?,?)",
                channel, tg, anon, session, event, target, "/", null,
                product == null ? null : UuidUtil.toBytes(product.toString()),
                Timestamp.from(when), Timestamp.from(when));
    }

    private void seedJournal(UUID p1, UUID p2) {
        // day 10: rolled up by the test
        event("WEB", null, "anon-aaaaaaaa", "s1", "view", "page", null, at(D10, 10));
        event("WEB", null, "anon-aaaaaaaa", "s1", StructuredEvents.PRODUCT_VIEW, null, p1, at(D10, 10));
        event("WEB", null, "anon-aaaaaaaa", "s1", StructuredEvents.ADD_TO_CART, null, p1, at(D10, 11));
        event("WEB", null, "anon-bbbbbbbb", "s2", StructuredEvents.PRODUCT_VIEW, null, p1, at(D10, 12));
        event("WEB", null, "anon-bbbbbbbb", "s2", StructuredEvents.PRODUCT_VIEW, null, p2, at(D10, 12));
        event("MINIAPP", 777001L, null, "m1", StructuredEvents.PRODUCT_VIEW, null, p1, at(D10, 13));
        event("MINIAPP", 777001L, null, "m1", StructuredEvents.CHECKOUT_START, null, null, at(D10, 14));
        event("MINIAPP", 777002L, null, "m2", "error", "boom", null, at(D10, 15));
        event("MINIAPP", 777002L, null, "m2", "error", "boom", null, at(D10, 16));
        event("MINIAPP", 777003L, null, "m3", "error", "bang", null, at(D10, 17));
        // day 11: stays in the journal, read on the fly
        event("MINIAPP", 777001L, null, "m4", StructuredEvents.PRODUCT_VIEW, null, p2, at(D11, 9));
        event("MINIAPP", 777001L, null, "m4", StructuredEvents.ADD_TO_CART, null, p2, at(D11, 9));
        event("WEB", null, "anon-cccccccc", "s3", StructuredEvents.PRODUCT_VIEW, null, p2, at(D11, 10));
    }

    @Test
    void rolledUpDayAndLiveDayReadTheSameNumbersAsBefore() {
        UUID p1 = UUID.randomUUID();
        UUID p2 = UUID.randomUUID();
        seedJournal(p1, p2);

        aggregation.aggregateDay(D10, EventClassifier.TitleIndex.empty());

        assertThat(jdbc.queryForList("select channel, visitor_key, stages, events from analytics_daily_visitors "
                + "where day = '2001-03-10' order by channel, visitor_key")).extracting(Object::toString)
                .containsExactly(
                        "{channel=MINIAPP, visitor_key=t:777001, stages=11, events=2}",
                        "{channel=MINIAPP, visitor_key=t:777002, stages=1, events=2}",
                        "{channel=MINIAPP, visitor_key=t:777003, stages=1, events=1}",
                        "{channel=WEB, visitor_key=a:anon-aaaaaaaa, stages=7, events=3}",
                        "{channel=WEB, visitor_key=a:anon-bbbbbbbb, stages=3, events=2}");
        assertThat(jdbc.queryForList("select channel, views, viewers, cart_adds from analytics_daily "
                + "where day = '2001-03-10' order by channel, views desc, product_id")).extracting(Object::toString)
                .containsExactly(
                        "{channel=MINIAPP, views=1, viewers=1, cart_adds=0}",
                        "{channel=WEB, views=2, viewers=2, cart_adds=1}",
                        "{channel=WEB, views=1, viewers=1, cart_adds=0}");
        assertThat(jdbc.queryForObject("select events from analytics_daily_runs where day = '2001-03-10'",
                Integer.class)).isEqualTo(10);
        // a rerun of the same day rewrites it, it does not double it
        aggregation.aggregateDay(D10, EventClassifier.TitleIndex.empty());
        assertThat(jdbc.queryForObject("select count(*) from analytics_daily_visitors where day = '2001-03-10'",
                Integer.class)).isEqualTo(5);

        AnalyticsReader.Window rolled = reader.read(at(D10, 0), at(D11, 0));
        assertThat(rolled.visitors()).hasSize(5);
        assertThat(rolled.products().stream().mapToInt(EventClassifier.ProductDay::views).sum()).isEqualTo(4);
        assertThat(rolled.products().stream().mapToInt(EventClassifier.ProductDay::cartAdds).sum()).isEqualTo(1);
        assertThat(rolled.dataSince()).isEqualTo(D10);
        AnalyticsReader.Window live = reader.read(at(D11, 0), at(D11.plusDays(1), 0));
        assertThat(live.visitors()).extracting(v -> v.visitorKey() + ":" + v.stages() + ":" + v.events())
                .containsExactly("t:777001:7:2", "a:anon-cccccccc:3:1");
        assertThat(live.products()).extracting(x -> x.channel() + ":" + x.views() + ":" + x.viewers() + ":" + x.cartAdds())
                .containsExactly("MINIAPP:1:1:1", "WEB:1:1:0");
        AnalyticsReader.Window both = reader.read(at(D10, 0), at(D11.plusDays(1), 0));
        assertThat(both.visitors()).hasSize(7);
        assertThat(both.products().stream().mapToInt(EventClassifier.ProductDay::views).sum()).isEqualTo(6);
        List<Object[]> errors = reader.topErrors(at(D10, 0), 10);
        assertThat(errors).hasSize(2);
        assertThat(errors.get(0)).containsExactly("boom", 2L, 1L);
        assertThat(errors.get(1)).containsExactly("bang", 1L, 1L);
        assertThat(reader.topErrors(at(D10, 0), 1)).hasSize(1);
    }

    @Test
    void staffIsLoadedFromAdminUsers() {
        StaffVisitors.Staff staff = staffVisitors.get();
        assertThat(staff).isNotNull();
        assertThat(staff.telegramIds()).doesNotContain(777001L);
    }

    /** A delivered order of 9 999 (3 x 3 333) dated that day of March 2001; each test owns its day. */
    private Order historicOrder(long tg, String phone, LocalDate day) {
        Product p = product(3_333, 10);
        Order o = orders.createOrder(checkout(tg, phone, p, 3));
        orderPayments.markPaid(o.getId(), 9_999);
        lifecycle.approve(o.getId());
        lifecycle.ship(o.getId(), "IT-TTN-" + tg);
        lifecycle.deliver(o.getId());
        Timestamp d = Timestamp.from(at(day, 12));
        jdbc.update("update orders set created_at = ?, approved_at = ?, paid_at = ?, shipped_at = ?, "
                + "delivered_at = ? where id = ?", d, d, d, d, d, o.getId());
        return o;
    }

    /**
     * The facts snapshot is memoised for 15 s, so both historic orders are created first and the test waits the
     * memo out once: whatever an earlier test loaded can no longer hide them.
     */
    @Test
    void factsMetricsReturnsAndMarginOfHistoricDays() throws InterruptedException {
        Order o = historicOrder(9_301, "+380675551301", D12);
        Order marginOrder = historicOrder(9_302, "+380675551302", D13);
        Thread.sleep(15_500);
        factsAndMetricsOfAHistoricDay(o);
        marginOfAHistoricOrderAndPeriod(marginOrder);
    }

    private void factsAndMetricsOfAHistoricDay(Order o) {
        String id = UuidUtil.toString(o.getId());

        MetricsFacts facts = loader.load();
        MetricsFacts.OrderFact fact = facts.orders().stream().filter(f -> f.id().equals(id)).findFirst().orElseThrow();
        assertThat(fact.totalMinor()).isEqualTo(9_999);
        assertThat(fact.receivedMinor()).isEqualTo(9_999);
        assertThat(fact.refundedMinor()).isZero();
        assertThat(fact.createdAt()).isEqualTo(at(D12, 12));
        assertThat(fact.deliveredAt()).isEqualTo(at(D12, 12));
        assertThat(fact.paid()).isTrue();
        assertThat(fact.source()).isEqualTo("MINIAPP");
        assertThat(facts.items().stream().filter(i -> i.orderId().equals(id)).mapToInt(MetricsFacts.ItemFact::quantity)
                .sum()).isEqualTo(3);

        MetricsPeriod day = metrics.period("custom", "2001-03-12", "2001-03-12");
        MetricsDtos.Overview overview = metrics.overview(day, ChannelFilter.ALL);
        assertThat(overview.kpis().soldMinor().value()).isEqualTo(9_999.0);
        assertThat(overview.kpis().receivedMinor().value()).isEqualTo(9_999.0);
        assertThat(overview.kpis().orders().value()).isEqualTo(1.0);
        assertThat(overview.kpis().aovMinor().value()).isEqualTo(9_999.0);
        assertThat(overview.kpis().rejectRatePct().value()).isZero();
        assertThat(overview.series()).hasSize(24);
        assertThat(overview.series().get(12).soldMinor()).isEqualTo(9_999);
        MetricsDtos.Customers customers = metrics.customers(day, ChannelFilter.ALL);
        assertThat(customers.kpis().buyers().value()).isEqualTo(1.0);
        assertThat(customers.kpis().newBuyers().value()).isEqualTo(1.0);
        assertThat(customers.kpis().avgLtvMinor()).isEqualTo(9_999);
        MetricsDtos.Operations operations = metrics.operations(day, ChannelFilter.ALL);
        assertThat(operations.speed()).hasSize(4);
        assertThat(operations.speed().get(0).count()).isEqualTo(1);
        assertThat(operations.rejects().total()).isEqualTo(1);
        assertThat(operations.rejects().codes()).isTrue();
        assertThat(operations.clientErrors()).isEmpty();
        MetricsDtos.Funnel funnel = metrics.funnel(day, ChannelFilter.ALL);
        assertThat(funnel.steps()).extracting(MetricsDtos.FunnelStep::count)
                .containsExactly(0L, 0L, 0L, 0L, 1L, 1L, 1L);
        assertThat(metrics.forecast(ChannelFilter.ALL)).isNotNull();
        assertThat(metrics.stock(day, ChannelFilter.ALL, 60, 30)).isNotNull();
        assertThat(metrics.today()).isNotNull();
        assertThat(metrics.runningOut()).isNotNull();

        jdbc.update("insert into order_money_movements (order_id, kind, channel, amount_minor, occurred_at, source) "
                + "values (?, 'REFUND', 'CASH', 1500, ?, 'ADMIN'), (?, 'REFUND', 'MONO', 700, ?, 'ADMIN'), "
                + "(?, 'REFUND', 'EXCHANGE', 999, ?, 'ADMIN'), (?, 'RETAINED', 'NP_COD', 300, ?, 'AUTO')",
                o.getId(), Timestamp.from(at(D12, 13)), o.getId(), Timestamp.from(at(D12, 14)),
                o.getId(), Timestamp.from(at(D12, 15)), o.getId(), Timestamp.from(at(D12, 16)));
        jdbc.update("insert into stock_writeoffs (product_id, title, quantity, reason, unit_value_minor, created_at) "
                + "values (?, 'x', 2, 'DEFECT', 500, ?), (?, 'y', 1, 'INVENTORY', 400, ?)",
                UuidUtil.toBytes(UUID.randomUUID().toString()), Timestamp.from(at(D12, 9)),
                UuidUtil.toBytes(UUID.randomUUID().toString()), Timestamp.from(at(D12, 9)));
        jdbc.update("update orders set returned_at = ? where id = ?", Timestamp.from(at(D12, 17)), o.getId());
        ReturnsReport.Returns r = returnsReport.compute(day.from(), day.to());
        assertThat(r.refundedMinor()).isEqualTo(2_200);
        assertThat(r.refundOrders()).isEqualTo(1);
        assertThat(r.byChannel()).extracting(ReturnsReport.ChannelRow::channel).containsExactly("CASH", "MONO");
        assertThat(r.retainedMinor()).isEqualTo(300);
        assertThat(r.retainedOrders()).isEqualTo(1);
        assertThat(r.writeoffUnits()).isEqualTo(3);
        assertThat(r.writeoffMinor()).isEqualTo(1_400);
        assertThat(r.writeoffsByReason()).extracting(ReturnsReport.ReasonRow::reason)
                .containsExactly("DEFECT", "INVENTORY");
        assertThat(r.returnedOrders()).isEqualTo(1);
    }

    private void marginOfAHistoricOrderAndPeriod(Order o) {
        String id = UuidUtil.toString(o.getId());
        OrderProfitDto p = margin.order(id);
        assertThat(p.revenueMinor()).isEqualTo(9_999);
        assertThat(p.costMinor()).isZero();
        assertThat(p.feeMinor()).isEqualTo(130); // 1,3 % estimated: the order is online-payable, no invoice
        assertThat(p.feeEstimated()).isTrue();
        assertThat(p.profitMinor()).isEqualTo(9_869);
        assertThat(p.complete()).isFalse();
        assertThat(p.lines()).hasSize(1);
        assertThat(p.lines().get(0).unknownUnits()).isEqualTo(3);
        MarginReportDto report = margin.report(metrics.period("custom", "2001-03-13", "2001-03-13"));
        assertThat(report.revenueMinor()).isEqualTo(9_999);
        assertThat(report.knownRevenueMinor()).isZero(); // lots of the test have no cost: nothing is "known"
        assertThat(report.costMinor()).isZero();
        assertThat(report.byProduct()).hasSize(1);
        assertThat(report.byProduct().get(0).unknownRevenueMinor()).isEqualTo(9_999);
        assertThat(report.byBatch().get(0).key()).isEqualTo("opening");
        assertThat(report.byBrand().get(0).label()).isEqualTo("Без бренда");
        assertThat(report.byCategory().get(0).label()).isEqualTo("Без категории");
    }
}
