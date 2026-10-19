package com.maxsolch.shop.bundle;

import java.util.Map;
import java.util.function.Function;

/**
 * Margin table of «Вместе дешевле» 2.0 (V60 {@code bundle_category_margins}), resolved per category:
 * the row of the category itself wins over its parent's, the parent's over the average
 * {@code gift.marginPercent}. A discount never eats the margin: {@code cap ≤ margin − safety}.
 *
 * <p>The cap of a category: the owner's manual discount if set, else (auto-tune on) what the auto-tune
 * computed, else {@code margin − safety} — always clamped to {@code 0..margin − safety}.
 */
public final class BundleMargins {

    public static final String SOURCE_MANUAL = "MANUAL";
    public static final String SOURCE_AUTO = "AUTO";
    public static final String SOURCE_MAX = "MAX";

    public record Row(Integer marginPercent, Integer discountPercent, Integer autoPercent) {
    }

    private final Map<String, Row> rows;
    private final Function<String, String> parentOf;
    private final int defaultMargin;
    private final int safety;
    private final boolean autoTune;

    public BundleMargins(Map<String, Row> rows, Function<String, String> parentOf, int defaultMargin, int safety,
                         boolean autoTune) {
        this.rows = rows == null ? Map.of() : rows;
        this.parentOf = parentOf == null ? id -> null : parentOf;
        this.defaultMargin = Math.max(0, Math.min(100, defaultMargin));
        this.safety = Math.max(0, safety);
        this.autoTune = autoTune;
    }

    /** Margin of the category, percent of the price. */
    public int margin(String categoryId) {
        Integer m = pick(categoryId, Row::marginPercent);
        return m == null ? defaultMargin : Math.max(0, Math.min(100, m));
    }

    /** The most a discount may be: margin − safety, at least 0. */
    public int maxPercent(String categoryId) {
        return Math.max(0, margin(categoryId) - safety);
    }

    public int cap(String categoryId) {
        int max = maxPercent(categoryId);
        Integer manual = pick(categoryId, Row::discountPercent);
        if (manual != null) {
            return clamp(manual, max);
        }
        Integer auto = autoTune ? pick(categoryId, Row::autoPercent) : null;
        return auto != null ? clamp(auto, max) : max;
    }

    public String capSource(String categoryId) {
        if (pick(categoryId, Row::discountPercent) != null) {
            return SOURCE_MANUAL;
        }
        return autoTune && pick(categoryId, Row::autoPercent) != null ? SOURCE_AUTO : SOURCE_MAX;
    }

    public boolean manual(String categoryId) {
        return pick(categoryId, Row::discountPercent) != null;
    }

    public int defaultMargin() {
        return defaultMargin;
    }

    public int safety() {
        return safety;
    }

    public Row row(String categoryId) {
        return categoryId == null ? null : rows.get(categoryId);
    }

    private Integer pick(String categoryId, Function<Row, Integer> f) {
        String cur = categoryId;
        // Two levels at most; the bound guards against a broken parent loop.
        for (int guard = 0; cur != null && guard < 8; guard++) {
            Row r = rows.get(cur);
            if (r != null && f.apply(r) != null) {
                return f.apply(r);
            }
            cur = parentOf.apply(cur);
        }
        return null;
    }

    private static int clamp(int v, int max) {
        return Math.max(0, Math.min(max, v));
    }
}
