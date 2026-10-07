package com.maxsolch.shop.analytics.metrics;

import java.time.Instant;
import java.util.List;

/**
 * Payloads of the metrics page tabs ({@code /api/admin/metrics/*}). Money is integer minor units
 * (kopecks); time buckets are cut in the shop's timezone. Definitions used throughout:
 * <ul>
 *   <li><b>sold</b> — {@code total_minor} (after the promo discount) of orders that are not REJECTED
 *       and not an online (monobank) order still waiting for its payment, by creation date
 *       ({@link MetricsFacts.OrderFact#sold()});</li>
 *   <li><b>received</b> — money by the date it arrived: the online / prepaid part by the payment
 *       date, the cash-on-delivery rest by the delivery date, minus refunds by their date;</li>
 *   <li><b>rejections</b> — among decided orders; online orders cancelled automatically for
 *       non-payment (PAYMENT_TIMEOUT) are abandoned payments, reported in {@link OnlinePayments};</li>
 *   <li>units/revenue per product count sold orders only, without gift lines; item revenue is the
 *       line price scaled by the order's discount share.</li>
 * </ul>
 */
public final class MetricsDtos {

    private MetricsDtos() {
    }

    /** Header shared by period-bound payloads. */
    public record PeriodInfo(String token, Instant from, Instant to, Instant prevFrom, Instant prevTo,
                             String granularity, String channel) {
        static PeriodInfo of(MetricsPeriod p, ChannelFilter c) {
            return new PeriodInfo(p.token(), p.from(), p.to(), p.prevFrom(), p.prevTo(),
                    p.granularity().name(), c.name());
        }
    }

    /** A KPI with its value in the comparison period and the change in percent (null = no base). */
    public record Kpi(double value, Double prev, Double changePct) {
        static Kpi of(double value, double prev, boolean prevHasData) {
            return new Kpi(value, prevHasData ? prev : null, prevHasData ? Stats.changePct(value, prev) : null);
        }
    }

    // ---------------------------------------------------------------- overview

    public record Overview(PeriodInfo period,
                           Kpis kpis,
                           MoneyNow money,
                           List<SeriesPoint> series,
                           List<SeriesPoint> prevSeries,
                           List<CategoryRow> categories,
                           List<ChannelRow> channels,
                           long[][] heatmap,
                           Giveaways giveaways,
                           List<SchemeRow> schemes,
                           OnlinePayments online) {
    }

    public record Kpis(Kpi soldMinor, Kpi receivedMinor, Kpi orders, Kpi aovMinor, Kpi rejectRatePct) {
    }

    /**
     * State right now (not period-bound): cash still travelling as cash-on-delivery, paid orders
     * waiting for the admin's confirmation, online orders not paid yet (within their 24 h), and
     * refunds in the period.
     */
    public record MoneyNow(long codInTransitMinor, long codInTransitOrders, long awaitingPaymentConfirm,
                           long refundedMinor, long awaitingPaymentOrders, long awaitingPaymentMinor) {
    }

    /**
     * One way of paying in the period — the old manual transfer to the card and monobank apart.
     *
     * @param orders     sold orders placed in the period
     * @param receivedMinor money that arrived in the period for orders of this scheme (any creation date)
     * @param timedOut   cancelled automatically for non-payment
     * @param awaiting   online orders still waiting for payment
     */
    public record SchemeRow(String key, String label, boolean online, long orders, long soldMinor, long aovMinor,
                            long receivedMinor, long rejected, long timedOut, long awaiting) {
    }

    /**
     * monobank in the period.
     *
     * @param since           first online order ever (null = none yet)
     * @param orders          orders placed with online payment
     * @param paidOrders      of them paid (online, or marked by the admin)
     * @param awaiting        of them still within the 24 h and unpaid
     * @param timedOut        of them cancelled automatically (PAYMENT_TIMEOUT)
     * @param conversionPct   paid / (orders − awaiting); null without decided orders
     * @param invoices        invoices issued in the period (one order may get several)
     * @param invoicesPaid    invoices credited in the period
     * @param invoicesFailed  issued in the period and ended unpaid (declined / expired)
     * @param paidMinor       credited in the period (by credit date)
     * @param refundedMinor   refunded through monobank in the period
     * @param feeMinor        the bank's fee on the credited invoices
     */
    public record OnlinePayments(Instant since, long orders, long fullOrders, long prepayOrders, long paidOrders,
                                 long awaiting, long timedOut, Double conversionPct, long invoices,
                                 long invoicesPaid, long invoicesFailed, long paidMinor, long refundedMinor,
                                 long feeMinor) {
    }

    public record SeriesPoint(String bucket, long orders, long soldMinor, long receivedMinor, long rejected) {
    }

    public record CategoryRow(String name, long units, long revenueMinor, double sharePct, long liveProducts,
                              double unitsPerProduct) {
    }

    public record ChannelRow(String source, long orders, long soldMinor, long aovMinor, double rejectRatePct,
                             Long visitors, long buyers, Double conversionPct) {
    }

    /** Revenue given away: promo discounts and gifts at their current retail price. */
    public record Giveaways(long discountMinor, long promoOrders, long giftUnits, long giftValueMinor) {
    }

    // ---------------------------------------------------------------- products & stock

    public record Stock(PeriodInfo period,
                        StockKpis kpis,
                        List<TopProduct> topProducts,
                        List<DeadStockRow> deadStock,
                        List<DeadStockBucket> deadStockBuckets,
                        List<ForgottenRow> forgotten,
                        List<CategoryStock> categories,
                        Reorder reorder) {
    }

    /**
     * @param stockValueMinor live stock at retail price (there is no cost price in the system)
     * @param daysOfCover     stock value / average daily sales over the last 30 days, same retail basis
     */
    public record StockKpis(long stockValueMinor, long stockUnits, long liveProducts, Double daysOfCover,
                            long deadStockMinor, long deadStockProducts, long runningOutProducts,
                            long forgottenMinor, long forgottenProducts) {
    }

    public record TopProduct(String productId, String title, long units, long revenueMinor, long orders,
                             boolean live, int stock) {
    }

    /**
     * @param daysWithoutSale days since the last sale, or since the product was created when it never sold
     * @param neverSold       true when it has no sale at all
     */
    public record DeadStockRow(String productId, String title, List<String> tags, int stock, long priceMinor,
                               long valueMinor, int daysWithoutSale, boolean neverSold, Long views30,
                               Long cartAdds30) {
    }

    public record DeadStockBucket(int days, long products, long units, long valueMinor) {
    }

    public record ForgottenRow(String productId, String title, int stock, long valueMinor, boolean archived) {
    }

    public record CategoryStock(String name, long products, long units, long valueMinor, Double daysOfCover) {
    }

    // ---------------------------------------------------------------- reorder / forecast

    /**
     * "What to reorder": fast movers that will run out, and demand for things that are gone.
     *
     * @param coverDays the horizon recommended quantities cover
     */
    public record Reorder(int coverDays, List<ReorderRow> rows, List<DemandRow> missedDemand, String method) {
    }

    /**
     * One product (or one variant of it).
     *
     * @param velocityPerDay recency-weighted units per day
     * @param daysToZero     stock / velocity, null when nothing sells
     * @param recommendQty   units to bring the stock to {@code coverDays} of sales, 0 when enough
     */
    public record ReorderRow(String productId, String variantId, String title, String variantName, int stock,
                             int sold30, int sold90, double velocityPerDay, Double daysToZero,
                             int recommendQty, long views30, long cartAdds30, boolean live, String urgency) {
    }

    /** A product people look for but cannot buy (out of stock or hidden). */
    public record DemandRow(String productId, String title, int stock, boolean live, long views30,
                            long viewers30, long cartAdds30, int sold90, Long lastSoldDaysAgo) {
    }

    /**
     * Revenue forecast. Daily model: level (recent average) × damped trend × day-of-week factor.
     *
     * @param history  actual daily sold for the recent past (chart)
     * @param forecast predicted daily sold with the interval band
     * @param accuracy backtest of the 30-day total on the shop's own history
     */
    public record Forecast(String basis,
                           MonthForecast month,
                           RangeForecast next30,
                           List<ForecastPoint> history,
                           List<ForecastPoint> forecast,
                           Accuracy accuracy,
                           List<Double> weekdayFactors,
                           String method) {
    }

    public record MonthForecast(String month, long actualToDateMinor, long remainingMinor, long totalMinor,
                                long lowMinor, long highMinor, int daysLeft) {
    }

    public record RangeForecast(long totalMinor, long lowMinor, long highMinor) {
    }

    public record ForecastPoint(String date, long valueMinor, Long lowMinor, Long highMinor) {
    }

    /**
     * @param mape30        mean absolute % error of the 30-day total over all backtest origins
     * @param naiveMape30   same for "the next 30 days = the last 30 days" (the bar to beat)
     * @param coveragePct   share of backtests whose actual fell inside the stated interval
     * @param backtests     number of forecast origins tested
     */
    public record Accuracy(Double mape30, Double naiveMape30, Double bias30, Double coveragePct, int backtests,
                           String label) {
    }

    // ---------------------------------------------------------------- customers

    public record Customers(PeriodInfo period,
                            CustomerKpis kpis,
                            List<RepeatBucket> repeatDistribution,
                            List<CohortRow> cohorts,
                            List<SignupWeek> signups,
                            List<TopCustomer> topCustomers,
                            List<PromoRow> promoCodes,
                            List<AovBucket> aovBuckets,
                            double avgItemsPerOrder) {
    }

    /**
     * @param repeatBuyers buyers in the period who had bought before it (or more than once in it)
     * @param avgLtvMinor  average lifetime sold per buyer (all history)
     */
    public record CustomerKpis(Kpi buyers, Kpi newBuyers, long repeatBuyers, Double repeatPct, long avgLtvMinor,
                               Double allTimeRepeatPct) {
    }

    public record RepeatBucket(String label, long buyers) {
    }

    /** First-order month and the share (%) of that cohort that ordered again in month +1..+6. */
    public record CohortRow(String month, long buyers, List<Double> returnedPct) {
    }

    /** New bot users of a week and how many of them ordered within 30 days of joining. */
    public record SignupWeek(String weekStart, long newUsers, long orderedWithin30, Double conversionPct,
                             boolean complete) {
    }

    public record TopCustomer(Long telegramUserId, String name, String username, long orders, long receivedMinor,
                              long soldMinor) {
    }

    public record PromoRow(String code, long orders, long discountMinor, long soldMinor, long newBuyers,
                           double rejectRatePct) {
    }

    public record AovBucket(String label, long orders, long soldMinor) {
    }

    // ---------------------------------------------------------------- funnel

    public record Funnel(PeriodInfo period, String dataSince, List<FunnelStep> steps,
                         List<InterestRow> lowConversion, String note) {
    }

    /**
     * @param fromStartPct share of the first step
     * @param fromPrevPct  share of the previous step
     */
    public record FunnelStep(String key, String label, long count, Double fromStartPct, Double fromPrevPct) {
    }

    public record InterestRow(String productId, String title, long views, long viewers, long cartAdds,
                              long unitsSold, long buyers, Double conversionPct, int stock, boolean live) {
    }

    // ---------------------------------------------------------------- operations

    public record Operations(PeriodInfo period,
                             List<SpeedRow> speed,
                             List<Violation> approvedNotShipped,
                             List<Violation> shippedNotDelivered,
                             RejectStats rejects,
                             List<CountRow> deliveryMethods,
                             List<CountRow> paymentOptions,
                             List<ErrorRow> clientErrors) {
    }

    /** Median/p90 of a step in hours; {@code count} = orders that have both timestamps. */
    public record SpeedRow(String key, String label, Double medianHours, Double p90Hours, long count, String note) {
    }

    public record Violation(String orderId, String customerName, Instant since, double hours, long totalMinor) {
    }

    /**
     * @param byReason           by reason code (null code = "не указано") — or, until the code
     *                           column exists, by the normalised free-text reason
     * @param afterShipping      rejected after being shipped (returned by the post)
     * @param paidNotRefundedMinor money received on rejected orders without a recorded refund
     * @param rejected           rejected by the shop / the customer, without {@code timedOut}
     * @param total              decided orders: without online orders still waiting for payment and
     *                           without {@code timedOut}
     * @param timedOut           online orders cancelled automatically for non-payment (PAYMENT_TIMEOUT);
     *                           they are listed in {@code byReason} but kept out of the rate
     */
    public record RejectStats(long rejected, long total, double ratePct, boolean codes, List<CountRow> byReason,
                              long afterShipping, long paidNotRefunded, long paidNotRefundedMinor,
                              long timedOut) {
    }

    public record CountRow(String key, String label, long count) {
    }

    public record ErrorRow(String message, long count, long users) {
    }

    // ---------------------------------------------------------------- today

    /**
     * The board's "Today" strip: work queues and today's money vs yesterday.
     * {@code awaitingPaymentConfirm} = orders paid online that are still NEW; {@code toApprove}
     * leaves out online orders still waiting for payment, counted in {@code awaitingPayment}.
     *
     * @param soldYesterdaySameTime sold yesterday up to the current time of day (fair comparison)
     */
    public record Today(long toApprove, long toShip, long awaitingPaymentConfirm, long awaitingPayment,
                        long soldTodayMinor, long ordersToday, long soldYesterdayMinor,
                        long soldYesterdaySameTimeMinor, long receivedTodayMinor, long receivedYesterdayMinor,
                        long codInTransitMinor, long runningOut, List<ReorderRow> reorderTop,
                        MonthForecast monthForecast) {
    }
}
