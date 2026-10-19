package com.maxsolch.shop.bundle;

import java.util.Map;

/**
 * How often top categories are bought together (orders of the last 180 days, not REJECTED).
 * {@code anchorOrders}: orders with the category; {@code together}: source → target → orders with both.
 */
public record BundlePairStats(int orders, Map<String, Integer> anchorOrders,
                              Map<String, Map<String, Integer>> together) {

    public static final BundlePairStats EMPTY = new BundlePairStats(0, Map.of(), Map.of());

    /** Too few orders to show «берут вместе в N %». */
    public static final int MIN_ANCHOR_ORDERS = 10;

    public int anchor(String top) {
        return top == null ? 0 : anchorOrders.getOrDefault(top, 0);
    }

    public int together(String sourceTop, String targetTop) {
        if (sourceTop == null || targetTop == null) {
            return 0;
        }
        Map<String, Integer> m = together.get(sourceTop);
        return m == null ? 0 : m.getOrDefault(targetTop, 0);
    }

    /** Smoothed share of the source's orders that also hold the target: (k+1)/(n+10). */
    public double strength(String sourceTop, String targetTop) {
        return (together(sourceTop, targetTop) + 1.0) / (anchor(sourceTop) + 10.0);
    }

    /** Plain share, 0..1 (0 when the source has no orders). */
    public double rate(String sourceTop, String targetTop) {
        int n = anchor(sourceTop);
        return n == 0 ? 0 : (double) together(sourceTop, targetTop) / n;
    }

    /** Whole percent for the storefront, 0 while there are too few orders to trust it. */
    public int percent(String sourceTop, String targetTop) {
        return anchor(sourceTop) < MIN_ANCHOR_ORDERS ? 0 : (int) Math.round(rate(sourceTop, targetTop) * 100);
    }
}
