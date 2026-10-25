package com.maxsolch.shop.service;

import com.maxsolch.shop.common.UuidUtil;
import com.maxsolch.shop.domain.StockWriteoff;
import com.maxsolch.shop.repository.StockWriteoffRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;

/** «Списания»: stock that left the shelf without a sale, for a period, with totals per reason. */
@Service
public class StockWriteoffReportService {

    /**
     * One write-off line; {@code valueMinor} = units still written off × unit value ({@code undoneQty}
     * went back on the shelf or into the order, V70).
     */
    public record Line(long id, Instant createdAt, String productId, String variantId, String title, int quantity,
                       String reason, String note, String orderId, String orderShortId, long unitValueMinor,
                       long valueMinor, String adminName, int undoneQty, String undoneNote) {
    }

    /** Totals of one reason. */
    public record ReasonTotal(String reason, int units, long valueMinor, int lines) {
    }

    public record Report(String range, List<Line> lines, List<ReasonTotal> byReason, int totalUnits,
                         long totalValueMinor) {
    }

    private final StockWriteoffRepository repository;

    public StockWriteoffReportService(StockWriteoffRepository repository) {
        this.repository = repository;
    }

    @Transactional(readOnly = true)
    public Report report(TimeRange range) {
        Instant from = range.from();
        List<StockWriteoff> rows = from == null
                ? repository.findAllByOrderByCreatedAtDesc()
                : repository.findByCreatedAtGreaterThanEqualOrderByCreatedAtDesc(from);
        return build(range.token(), rows);
    }

    static Report build(String range, List<StockWriteoff> rows) {
        List<Line> lines = new ArrayList<>();
        Map<StockWriteoff.Reason, long[]> totals = new EnumMap<>(StockWriteoff.Reason.class);
        for (StockWriteoff.Reason r : StockWriteoff.Reason.values()) {
            totals.put(r, new long[3]);
        }
        int units = 0;
        long value = 0;
        for (StockWriteoff w : rows) {
            int active = w.activeQty();
            long v = w.getUnitValueMinor() * active;
            String orderId = w.getOrderId() == null ? null : UuidUtil.toString(w.getOrderId());
            lines.add(new Line(w.getId() == null ? 0 : w.getId(), w.getCreatedAt(),
                    UuidUtil.toString(w.getProductId()),
                    w.getVariantId() == null ? null : UuidUtil.toString(w.getVariantId()),
                    w.getTitle(), w.getQuantity(), w.getReason(), w.getNote(), orderId,
                    orderId == null ? null : orderId.substring(0, Math.min(8, orderId.length())),
                    w.getUnitValueMinor(), v, w.getAdminName(), w.getUndoneQty(), w.getUndoneNote()));
            if (active <= 0) {
                continue;
            }
            StockWriteoff.Reason reason = reasonOf(w.getReason());
            long[] t = totals.get(reason);
            t[0] += active;
            t[1] += v;
            t[2]++;
            units += active;
            value += v;
        }
        List<ReasonTotal> byReason = new ArrayList<>();
        totals.forEach((r, t) -> byReason.add(new ReasonTotal(r.name(), (int) t[0], t[1], (int) t[2])));
        return new Report(range, lines, byReason, units, value);
    }

    private static StockWriteoff.Reason reasonOf(String raw) {
        try {
            return StockWriteoff.Reason.valueOf(raw);
        } catch (RuntimeException e) {
            return StockWriteoff.Reason.OTHER;
        }
    }
}
