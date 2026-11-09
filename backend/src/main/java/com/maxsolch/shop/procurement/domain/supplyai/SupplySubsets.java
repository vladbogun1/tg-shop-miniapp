package com.maxsolch.shop.procurement.domain.supplyai;

import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/**
 * Which of a few doubtful lines to take so that the lines add up to the document total: a screenshot repeat to drop,
 * a line found on a second reading to add. All combinations are tried (at most {@link #MAX} lines — 4 096 sums);
 * the closest sum wins, on a tie the one that takes more lines (a repeat is more likely than a coincidence).
 */
public final class SupplySubsets {

    /** More doubtful lines than this in one document is a broken reading, not overlaps: the rest stay as they are. */
    public static final int MAX = 12;

    private SupplySubsets() {
    }

    /**
     * @param base    the sum of the certain lines
     * @param amounts the doubtful lines (price × quantity), by index
     * @param sign    +1 — taken lines are added to the base, −1 — taken lines are removed from it
     * @return indexes of the taken lines
     */
    public static Set<Integer> closest(double base, List<Double> amounts, double target, int sign) {
        int n = Math.min(amounts.size(), MAX);
        int best = 0;
        double bestGap = Double.MAX_VALUE;
        for (int mask = 0; mask < (1 << n); mask++) {
            double sum = base;
            for (int i = 0; i < n; i++) {
                if ((mask & (1 << i)) != 0) {
                    sum += sign * amounts.get(i);
                }
            }
            double gap = SupplyChecks.round2(Math.abs(sum - target));
            if (gap < bestGap || (gap == bestGap && Integer.bitCount(mask) > Integer.bitCount(best))) {
                best = mask;
                bestGap = gap;
            }
        }
        Set<Integer> out = new LinkedHashSet<>();
        for (int i = 0; i < n; i++) {
            if ((best & (1 << i)) != 0) {
                out.add(i);
            }
        }
        return out;
    }

    /** Price × quantity of a line; no price — 0. */
    public static double amount(SourceLine l) {
        return (l.unitPrice() == null ? 0 : l.unitPrice()) * l.qty();
    }
}
