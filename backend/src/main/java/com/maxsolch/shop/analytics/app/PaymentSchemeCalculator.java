package com.maxsolch.shop.analytics.app;

import com.maxsolch.shop.analytics.app.MetricsDtos.OnlinePayments;
import com.maxsolch.shop.analytics.app.MetricsDtos.SchemeRow;
import com.maxsolch.shop.analytics.domain.ChannelFilter;
import com.maxsolch.shop.analytics.domain.MetricsFacts;
import com.maxsolch.shop.analytics.domain.MetricsFacts.InvoiceFact;
import com.maxsolch.shop.analytics.domain.MetricsFacts.OrderFact;
import com.maxsolch.shop.analytics.domain.MetricsFacts.PaymentScheme;
import com.maxsolch.shop.analytics.domain.MetricsPeriod;
import com.maxsolch.shop.analytics.domain.Stats;

import java.time.Instant;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;

/** The payment blocks of the "Обзор" tab ({@link OverviewCalculator}): schemes side by side and monobank payments. */
final class PaymentSchemeCalculator {

    private PaymentSchemeCalculator() {
    }

    /**
     * Old manual transfers vs monobank side by side: orders by creation date (sold / rejected /
     * abandoned / still waiting) and money by the date it arrived.
     */
    static List<SchemeRow> schemes(List<OrderFact> orders, MetricsPeriod period, ChannelFilter channel) {
        Map<PaymentScheme, long[]> acc = new EnumMap<>(PaymentScheme.class);
        // sold orders, sold, received, rejected, timed out, awaiting payment
        for (OrderFact o : orders) {
            if (!channel.matches(o.source())) {
                continue;
            }
            long received = OverviewCalculator.receivedIn(o, period.from(), period.to());
            boolean placed = period.contains(o.createdAt());
            if (!placed && received == 0) {
                continue;
            }
            long[] a = acc.computeIfAbsent(o.scheme(), k -> new long[6]);
            a[2] += received;
            if (!placed) {
                continue;
            }
            if (o.awaitingPayment()) {
                a[5]++;
            } else if (o.paymentTimedOut()) {
                a[4]++;
            } else if (o.rejected()) {
                a[3]++;
            } else {
                a[0]++;
                a[1] += o.soldMinor();
            }
        }
        List<SchemeRow> out = new ArrayList<>();
        acc.forEach((scheme, a) -> out.add(new SchemeRow(scheme.name(), scheme.label, scheme.online(),
                a[0], a[1], a[0] == 0 ? 0 : a[1] / a[0], a[2], a[3], a[4], a[5])));
        return out;
    }

    /**
     * monobank payments in the period: orders placed with online payment and how many got paid,
     * invoices issued and how they ended, money credited, refunded and the bank's fee.
     */
    static OnlinePayments onlinePayments(MetricsFacts facts, MetricsPeriod period, ChannelFilter channel) {
        Map<String, OrderFact> byId = facts.orderById();
        long placed = 0;
        long paidOrders = 0;
        long awaiting = 0;
        long timedOut = 0;
        long full = 0;
        long prepay = 0;
        Instant since = null;
        for (OrderFact o : facts.orders()) {
            if (!o.online() || !channel.matches(o.source())) {
                continue;
            }
            if (since == null || o.createdAt() != null && o.createdAt().isBefore(since)) {
                since = o.createdAt();
            }
            if (!period.contains(o.createdAt())) {
                continue;
            }
            placed++;
            if (o.scheme() == PaymentScheme.ONLINE_PREPAY) {
                prepay++;
            } else {
                full++;
            }
            if (o.onlinePaidMinor() > 0 || o.paid() || o.receivedMinor() > 0) {
                paidOrders++;
            } else if (o.awaitingPayment()) {
                awaiting++;
            } else if (o.paymentTimedOut()) {
                timedOut++;
            }
        }
        long invoices = 0;
        long credited = 0;
        long failed = 0;
        long creditedMinor = 0;
        long refundedMinor = 0;
        long feeMinor = 0;
        for (InvoiceFact inv : facts.invoices()) {
            OrderFact o = byId.get(inv.orderId());
            if (o != null && !channel.matches(o.source())) {
                continue;
            }
            if (period.contains(inv.createdAt())) {
                invoices++;
                if (inv.failedOrExpired()) {
                    failed++;
                }
            }
            if (inv.credited() && period.contains(inv.appliedAt())) {
                credited++;
                creditedMinor += inv.amountMinor();
                feeMinor += inv.feeMinor();
            }
            if (inv.refundedMinor() > 0 && period.contains(inv.updatedAt())) {
                refundedMinor += inv.refundedMinor();
            }
        }
        long decided = placed - awaiting;
        Double conversion = decided == 0 ? null : Stats.round1(paidOrders * 100.0 / decided);
        return new OnlinePayments(since, placed, full, prepay, paidOrders, awaiting, timedOut, conversion,
                invoices, credited, failed, creditedMinor, refundedMinor, feeMinor);
    }
}
