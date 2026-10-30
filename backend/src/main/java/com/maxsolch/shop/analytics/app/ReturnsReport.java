package com.maxsolch.shop.analytics.app;

import com.maxsolch.shop.analytics.domain.ReturnsRows.ChannelRow;
import com.maxsolch.shop.analytics.domain.ReturnsRows.ReasonRow;
import com.maxsolch.shop.analytics.infra.ReturnsQueries;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.List;

/**
 * «Возвраты» in the metrics (V68): money given back by the date it went back and by channel (the
 * order money journal), what the shop kept on purpose, and what was written off. Unlike
 * {@code MoneyNow.refundedMinor} — one date per order — a refund made in two steps lands on both days.
 */
@Service
public class ReturnsReport {

    private final ReturnsQueries queries;

    public ReturnsReport(ReturnsQueries queries) {
        this.queries = queries;
    }

    public record Returns(long refundedMinor,
                          long refundOrders,
                          List<ChannelRow> byChannel,
                          long retainedMinor,
                          long retainedOrders,
                          long writeoffUnits,
                          long writeoffMinor,
                          List<ReasonRow> writeoffsByReason,
                          /** Units customers sent back by return date (order_items.returned_qty of orders returned in the period). */
                          long returnedOrders) {
    }

    public Returns compute(Instant from, Instant to) {
        List<ChannelRow> channels = queries.refundsByChannel(from, to);
        long refunded = channels.stream().mapToLong(ChannelRow::amountMinor).sum();
        long[] retained = queries.retained(from, to);
        List<ReasonRow> reasons = queries.writeoffsByReason(from, to);
        return new Returns(refunded, queries.refundOrders(from, to), channels,
                retained[0], retained[1],
                reasons.stream().mapToLong(ReasonRow::units).sum(),
                reasons.stream().mapToLong(ReasonRow::valueMinor).sum(),
                reasons,
                queries.returnedOrders(from, to));
    }
}
