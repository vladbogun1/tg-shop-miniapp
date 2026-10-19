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
 * lines are never each other's add-on). The three most expensive add-on units set the tier
 * (1 → tier1, 2 → tier2, 3+ → tier3); each add-on line gets {@code min(tier, cap of its category)}
 * — the cap comes from the category margin (2.0, docs/BUNDLES.md); a category with cap 0 is no
 * add-on at all. Each unit's discount is rounded down to whole hryvnias.
 *
 * <p>«Собери сетап» (2.0): a line that is no add-on but the target of a setup rule from a dearer line
 * («Мыши → Клавиатуры») gets {@code min(setupPercent, cap)} on one unit; the add-on price limit does
 * not apply and setup lines do not count towards the tier. The order total is capped by
 * {@code maxDiscountMinor} (0 = no cap).
 */
public final class BundlePricing {

    /** Add-on units that get the discount; more do not raise the tier. */
    public static final int MAX_ADDON_UNITS = 3;

    public static final String KIND_ADDON = "ADDON";
    public static final String KIND_SETUP = "SETUP";

    private BundlePricing() {
    }

    /**
     * @param capPercent   category id (the line's own) → the most percent its goods may get; null = 100
     * @param setupRules   «Собери сетап» pairs; empty = off
     * @param setupPercent percent for a setup line (still capped); 0 = setup gives no discount
     */
    public record Config(boolean enabled, List<Integer> tiers, int maxAddonPricePercent, long maxDiscountMinor,
                         Function<String, Integer> capPercent, List<Rule> setupRules, int setupPercent) {

        /** 1.0 terms: no margin caps, no setup. */
        public Config(boolean enabled, List<Integer> tiers, int maxAddonPricePercent, long maxDiscountMinor) {
            this(enabled, tiers, maxAddonPricePercent, maxDiscountMinor, null, List.of(), 0);
        }

        /** Percent for {@code units} add-on units (1..3); 0 when there is no tier. */
        public int percentFor(int units) {
            if (units <= 0 || tiers == null || tiers.isEmpty()) {
                return 0;
            }
            int i = Math.min(units, tiers.size()) - 1;
            return Math.max(0, Math.min(100, tiers.get(i)));
        }

        /** Cap of a category, 0..100. */
        public int capFor(String categoryId) {
            if (capPercent == null) {
                return 100;
            }
            Integer c = capPercent.apply(categoryId);
            return c == null ? 100 : Math.max(0, Math.min(100, c));
        }
    }

    /** {@code key} identifies the line for the caller (product::variant). */
    public record Line(String key, String categoryId, long unitPriceMinor, int quantity) {
    }

    public record Rule(String sourceCategoryId, String targetCategoryId) {
    }

    /** {@code kind}: ADDON | SETUP. */
    public record LineDiscount(String key, int percent, int units, long discountMinor, String kind) {
        public LineDiscount(String key, int percent, int units, long discountMinor) {
            this(key, percent, units, discountMinor, KIND_ADDON);
        }
    }

    /**
     * {@code lines}: only the lines that got a discount, by key. {@code percent}: the largest percent
     * an add-on line got after the caps (0 when only setup lines are discounted).
     */
    public record Result(long discountMinor, int percent, int addonUnits, Map<String, LineDiscount> lines) {
        public static final Result EMPTY = new Result(0, 0, 0, Map.of());
    }

    /**
     * @param path category id → that category and its ancestors (leaf first); unknown → empty
     */
    public static Result compute(List<Line> lines, List<Rule> rules, Function<String, List<String>> path,
                                 Config cfg) {
        if (cfg == null || !cfg.enabled() || lines == null || lines.size() < 2) {
            return Result.EMPTY;
        }
        List<Rule> addonRules = rules == null ? List.of() : rules;
        List<Rule> setupRules = cfg.setupRules() == null || cfg.setupPercent() <= 0 ? List.of() : cfg.setupRules();
        if (addonRules.isEmpty() && setupRules.isEmpty()) {
            return Result.EMPTY;
        }
        List<Line> addons = new ArrayList<>();
        List<Line> setups = new ArrayList<>();
        for (int a = 0; a < lines.size(); a++) {
            Line line = lines.get(a);
            if (line.quantity() <= 0 || line.unitPriceMinor() <= 0 || cfg.capFor(line.categoryId()) <= 0) {
                continue;
            }
            boolean addon = false;
            for (int b = 0; b < lines.size() && !addon; b++) {
                addon = a != b && isAddonOf(line, a, lines.get(b), b, addonRules, path, cfg.maxAddonPricePercent());
            }
            if (addon) {
                addons.add(line);
                continue;
            }
            for (int b = 0; b < lines.size(); b++) {
                if (a != b && isAddonOf(line, a, lines.get(b), b, setupRules, path, 100)) {
                    setups.add(line);
                    break;
                }
            }
        }

        Map<String, LineDiscount> out = new LinkedHashMap<>();
        long total = 0;
        int units = 0;
        int shownPercent = 0;
        if (!addons.isEmpty()) {
            // The most expensive units first: the discount goes where the customer notices it.
            addons.sort(Comparator.comparingLong(Line::unitPriceMinor).reversed());
            Map<String, Integer> unitsByKey = new LinkedHashMap<>();
            for (Line l : addons) {
                int take = Math.min(l.quantity(), MAX_ADDON_UNITS - units);
                if (take <= 0) {
                    break;
                }
                unitsByKey.merge(l.key(), take, Integer::sum);
                units += take;
            }
            int tier = cfg.percentFor(units);
            for (Line l : addons) {
                Integer u = unitsByKey.get(l.key());
                if (u == null || out.containsKey(l.key())) {
                    continue;
                }
                int pct = Math.min(tier, cfg.capFor(l.categoryId()));
                long d = unitDiscount(l.unitPriceMinor(), pct) * u;
                if (d > 0) {
                    out.put(l.key(), new LineDiscount(l.key(), pct, u, d, KIND_ADDON));
                    total += d;
                    shownPercent = Math.max(shownPercent, pct);
                }
            }
        }
        for (Line l : setups) {
            if (out.containsKey(l.key())) {
                continue;
            }
            int pct = Math.min(Math.min(100, cfg.setupPercent()), cfg.capFor(l.categoryId()));
            long d = unitDiscount(l.unitPriceMinor(), pct);
            if (d > 0) {
                out.put(l.key(), new LineDiscount(l.key(), pct, 1, d, KIND_SETUP));
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
        return new Result(total, shownPercent, units, out);
    }

    /** Discount of one unit: {@code percent} of the price, rounded down to whole hryvnias. */
    public static long unitDiscount(long unitPriceMinor, int percent) {
        long raw = unitPriceMinor * percent / 100;
        return raw / 100 * 100;
    }

    static boolean isAddonOf(Line addon, int addonIndex, Line anchor, int anchorIndex, List<Rule> rules,
                             Function<String, List<String>> path, int maxAddonPricePercent) {
        if (rules.isEmpty() || anchor.quantity() <= 0 || anchor.unitPriceMinor() <= 0) {
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
            list.set(i, new LineDiscount(d.key(), d.percent(), d.units(), d.discountMinor() - cut, d.kind()));
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
