package com.maxsolch.shop.bundle;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Function;

/**
 * «Вместе дешевле» arithmetic, free of Spring and the database: the checkout, the cart quote and the
 * tests all run the very same code, so the price the customer saw is the price the order gets.
 *
 * <p>A cart line is an <b>add-on</b> when another line of the cart is its anchor: a rule
 * «source → target» matches the anchor's category (or one of its ancestors) and the add-on's, and
 * the add-on costs at most {@code maxAddonPricePercent} % of the anchor (and less than it, so two
 * lines are never each other's add-on). The three most expensive add-on units get the tier percent
 * for their count (1 → tier1, 2 → tier2, 3+ → tier3), each unit's discount rounded down to whole
 * hryvnias; the order total is capped by {@code maxDiscountMinor} (0 = no cap).
 */
public final class BundlePricing {

    /** Add-on units that get the discount; more do not raise the tier. */
    public static final int MAX_ADDON_UNITS = 3;

    private BundlePricing() {
    }

    public record Config(boolean enabled, List<Integer> tiers, int maxAddonPricePercent, long maxDiscountMinor) {

        /** Percent for {@code units} add-on units (1..3); 0 when there is no tier. */
        public int percentFor(int units) {
            if (units <= 0 || tiers == null || tiers.isEmpty()) {
                return 0;
            }
            int i = Math.min(units, tiers.size()) - 1;
            return Math.max(0, Math.min(100, tiers.get(i)));
        }
    }

    /** {@code key} identifies the line for the caller (product::variant). */
    public record Line(String key, String categoryId, long unitPriceMinor, int quantity) {
    }

    public record Rule(String sourceCategoryId, String targetCategoryId) {
    }

    public record LineDiscount(String key, int percent, int units, long discountMinor) {
    }

    /** {@code lines}: only the add-on lines that got a discount, by key. */
    public record Result(long discountMinor, int percent, int addonUnits, Map<String, LineDiscount> lines) {
        public static final Result EMPTY = new Result(0, 0, 0, Map.of());
    }

    /**
     * @param path category id → that category and its ancestors (leaf first); unknown → empty
     */
    public static Result compute(List<Line> lines, List<Rule> rules, Function<String, List<String>> path,
                                 Config cfg) {
        if (cfg == null || !cfg.enabled() || lines == null || lines.size() < 2 || rules == null || rules.isEmpty()) {
            return Result.EMPTY;
        }
        List<Line> addons = new ArrayList<>();
        for (int a = 0; a < lines.size(); a++) {
            Line addon = lines.get(a);
            if (addon.quantity() <= 0 || addon.unitPriceMinor() <= 0) {
                continue;
            }
            for (int b = 0; b < lines.size(); b++) {
                if (a != b && isAddonOf(addon, a, lines.get(b), b, rules, path, cfg.maxAddonPricePercent())) {
                    addons.add(addon);
                    break;
                }
            }
        }
        if (addons.isEmpty()) {
            return Result.EMPTY;
        }

        // The most expensive units first: the discount goes where the customer notices it.
        addons.sort(Comparator.comparingLong(Line::unitPriceMinor).reversed());
        int units = 0;
        Map<String, Integer> unitsByKey = new LinkedHashMap<>();
        for (Line l : addons) {
            int take = Math.min(l.quantity(), MAX_ADDON_UNITS - units);
            if (take <= 0) {
                break;
            }
            unitsByKey.merge(l.key(), take, Integer::sum);
            units += take;
        }
        int percent = cfg.percentFor(units);
        if (percent <= 0) {
            return Result.EMPTY;
        }

        Map<String, LineDiscount> out = new LinkedHashMap<>();
        long total = 0;
        for (Line l : addons) {
            Integer u = unitsByKey.get(l.key());
            if (u == null || out.containsKey(l.key())) {
                continue;
            }
            long perUnit = unitDiscount(l.unitPriceMinor(), percent);
            long d = perUnit * u;
            if (d > 0) {
                out.put(l.key(), new LineDiscount(l.key(), percent, u, d));
                total += d;
            }
        }
        if (total <= 0) {
            return Result.EMPTY;
        }
        if (cfg.maxDiscountMinor() > 0 && total > cfg.maxDiscountMinor()) {
            out = capped(out, cfg.maxDiscountMinor());
            total = cfg.maxDiscountMinor();
        }
        return new Result(total, percent, units, out);
    }

    /** Discount of one unit: {@code percent} of the price, rounded down to whole hryvnias. */
    public static long unitDiscount(long unitPriceMinor, int percent) {
        long raw = unitPriceMinor * percent / 100;
        return raw / 100 * 100;
    }

    static boolean isAddonOf(Line addon, int addonIndex, Line anchor, int anchorIndex, List<Rule> rules,
                             Function<String, List<String>> path, int maxAddonPricePercent) {
        if (anchor.quantity() <= 0 || anchor.unitPriceMinor() <= 0) {
            return false;
        }
        int pct = Math.max(1, Math.min(100, maxAddonPricePercent));
        if (addon.unitPriceMinor() * 100 > anchor.unitPriceMinor() * pct) {
            return false;
        }
        // Equal prices (only possible at 100 %): the later line is the add-on, never both.
        if (addon.unitPriceMinor() == anchor.unitPriceMinor() && addonIndex < anchorIndex) {
            return false;
        }
        List<String> anchorPath = path.apply(anchor.categoryId());
        List<String> addonPath = path.apply(addon.categoryId());
        if (anchorPath.isEmpty() || addonPath.isEmpty()) {
            return false;
        }
        for (Rule r : rules) {
            if (anchorPath.contains(r.sourceCategoryId()) && addonPath.contains(r.targetCategoryId())) {
                return true;
            }
        }
        return false;
    }

    /** Trims the per-line discounts from the cheapest line up until they sum to {@code cap}. */
    private static Map<String, LineDiscount> capped(Map<String, LineDiscount> lines, long cap) {
        List<LineDiscount> list = new ArrayList<>(lines.values());
        long over = list.stream().mapToLong(LineDiscount::discountMinor).sum() - cap;
        for (int i = list.size() - 1; i >= 0 && over > 0; i--) {
            LineDiscount d = list.get(i);
            long cut = Math.min(over, d.discountMinor());
            list.set(i, new LineDiscount(d.key(), d.percent(), d.units(), d.discountMinor() - cut));
            over -= cut;
        }
        Map<String, LineDiscount> out = new LinkedHashMap<>();
        for (LineDiscount d : list) {
            if (d.discountMinor() > 0) {
                out.put(d.key(), d);
            }
        }
        return out;
    }
}
