package com.maxsolch.shop.procurement.domain;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;

/** When a batch is expected, as a rule of the batch itself: which of two batches comes sooner, the "~N weeks". */
public final class BatchEta {

    private BatchEta() {
    }

    /**
     * «~N тижнів» for an approximate ETA: whole weeks from {@code today} to {@code target}, rounded up;
     * 0 once the date has come («найближчим часом»).
     */
    public static int approxWeeks(LocalDate target, LocalDate today) {
        if (target == null) {
            return 0;
        }
        long days = ChronoUnit.DAYS.between(today, target);
        return days <= 0 ? 0 : (int) ((days + 6) / 7);
    }

    /** The batch that comes first: known date first (the earlier of from/to), then the older batch. */
    public static PreorderBatch sooner(PreorderBatch a, PreorderBatch b) {
        return bySoonest(a, b) <= 0 ? a : b;
    }

    /** Known date first (the earliest of from/to), then the oldest batch. */
    public static int bySoonest(PreorderBatch a, PreorderBatch b) {
        LocalDate da = expected(a);
        LocalDate db = expected(b);
        if (da != null && db != null && !da.equals(db)) {
            return da.compareTo(db);
        }
        if (da == null ^ db == null) {
            return da == null ? 1 : -1;
        }
        return Long.compare(a.getId() == null ? 0 : a.getId(), b.getId() == null ? 0 : b.getId());
    }

    private static LocalDate expected(PreorderBatch b) {
        if (b.etaModeEnum() == PreorderBatch.EtaMode.HIDDEN) {
            return null;
        }
        return b.getEtaFrom() != null ? b.getEtaFrom() : b.getEtaTo();
    }
}
