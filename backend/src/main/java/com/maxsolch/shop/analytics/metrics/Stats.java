package com.maxsolch.shop.analytics.metrics;

import java.util.Arrays;
import java.util.List;

/** Small, dependency-free statistics helpers for the calculators. */
public final class Stats {

    private Stats() {
    }

    /**
     * Percentile with linear interpolation between closest ranks (p in 0..100). Null for no data.
     * Medians and p90s replace averages: one forgotten order skewed "time to ship" by days.
     */
    public static Double percentile(List<Double> values, double p) {
        if (values == null || values.isEmpty()) {
            return null;
        }
        double[] sorted = values.stream().mapToDouble(Double::doubleValue).toArray();
        Arrays.sort(sorted);
        if (sorted.length == 1) {
            return sorted[0];
        }
        double rank = (p / 100.0) * (sorted.length - 1);
        int lo = (int) Math.floor(rank);
        int hi = (int) Math.ceil(rank);
        double frac = rank - lo;
        return sorted[lo] + (sorted[hi] - sorted[lo]) * frac;
    }

    public static Double median(List<Double> values) {
        return percentile(values, 50);
    }

    /** Relative change in percent, or null when the base is zero (no meaningful ratio). */
    public static Double changePct(double current, double previous) {
        if (previous == 0) {
            return null;
        }
        return round1((current - previous) / Math.abs(previous) * 100.0);
    }

    public static double round1(double v) {
        return Math.round(v * 10.0) / 10.0;
    }

    public static double round2(double v) {
        return Math.round(v * 100.0) / 100.0;
    }

    public static Double round2(Double v) {
        return v == null ? null : round2(v.doubleValue());
    }
}
