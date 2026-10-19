package com.maxsolch.shop.bundle;

import com.maxsolch.shop.bundle.BundleDtos.OfferItemDto;
import com.maxsolch.shop.bundle.BundleDtos.ScoreDto;
import com.maxsolch.shop.bundle.BundleDtos.SlotDto;
import com.maxsolch.shop.web.dto.ProductDto;
import com.maxsolch.shop.web.dto.TagDto;

import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.function.IntSupplier;
import java.util.regex.Pattern;

/**
 * Picks what to offer next to a product, «Вместе дешевле» 2.0 (docs/BUNDLES.md «Подбор»). Pure: the
 * service hands it the catalog, the pair statistics and the margins.
 *
 * <p>score = Pair × Demand × Match × Price × Stock × Margin:
 * <ul>
 *   <li>Pair — how often the anchor's top category is bought with the target's, (k+1)/(n+10);</li>
 *   <li>Demand — √((sold+2)/(category average+2)), ±5 % per rating star around 4.5 (3+ reviews);</li>
 *   <li>Match — same non-neutral color ×1.3, both neutral ×1.1, same theme ×1.15, same brand ×1.05,
 *       light mouse + fast mat ×1.1;</li>
 *   <li>Price — share of the anchor's price: 8–30 % → 1, 30–50 % → 0.8, 5–8 % → 0.85, less → 0.7;</li>
 *   <li>Stock — 3+ → 1, 1–2 → 0.85;</li>
 *   <li>Margin — what is left of the margin after the discount, relative to the average margin.</li>
 * </ul>
 * Hard filters: in stock, not the gift, not in the cart, its category not in the cart, the switch
 * types of keycaps fit. Add-ons are cheaper than the anchor and within the add-on price limit; the
 * setup block («Собери сетап») has no price limit.
 *
 * <p>One slot per target category; the slot holds its best model (the colour closest to the anchor
 * first), the other colours of the same model (a «family»: brand + category + title without colour
 * words) and up to two alternatives (COLOR_MATCH, CHEAPER, OTHER_BRAND). In {@code explorePercent}
 * of the shows the primary is the second-best model, so new goods collect statistics too.
 */
public final class BundleRanker {

    public static final String REASON_COLOR = "COLOR_MATCH";
    public static final String REASON_HIT = "HIT";
    public static final String REASON_LAST = "LAST_ONE";

    public static final String ALT_COLOR = "COLOR_MATCH";
    public static final String ALT_CHEAPER = "CHEAPER";
    public static final String ALT_BRAND = "OTHER_BRAND";

    private static final Set<String> NEUTRAL = Set.of("black", "white", "gray", "silver");
    private static final Set<String> NO_THEME = Set.of("other", "plain");
    private static final Set<String> FAST_GLIDE = Set.of("speed", "balanced");
    private static final int MAX_COLORS = 6;
    private static final int MAX_ALTERNATIVES = 2;

    /** Colour words in the three languages, dropped from a title to find the model family. */
    private static final Pattern COLOR_WORDS = Pattern.compile(
            "\\b(black|white|gray|grey|silver|pink|purple|violet|red|orange|green|blue|light blue|yellow|beige|brown"
                    + "|cream|mint|lavender|navy|gold|transparent|clear|frost|matte|glossy"
                    + "|черн\\p{L}*|чёрн\\p{L}*|чорн\\p{L}*|бел\\p{L}*|біл\\p{L}*|сер\\p{L}*|сір\\p{L}*|серебр\\p{L}*"
                    + "|срібл\\p{L}*|розов\\p{L}*|рожев\\p{L}*|фиолетов\\p{L}*|фіолетов\\p{L}*|красн\\p{L}*|червон\\p{L}*"
                    + "|оранжев\\p{L}*|помаранчев\\p{L}*|зелен\\p{L}*|син\\p{L}*|голуб\\p{L}*|блакитн\\p{L}*"
                    + "|желт\\p{L}*|жовт\\p{L}*|бежев\\p{L}*|коричнев\\p{L}*|прозор\\p{L}*)\\b",
            Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE | Pattern.UNICODE_CHARACTER_CLASS);
    private static final Pattern NON_WORD = Pattern.compile("[^\\p{L}\\p{N}]+");

    /**
     * @param discountFor   category → the percent an offered product of it gets (the margin factor)
     * @param withScore     put the factors into the items (admin preview)
     * @param exploreRoll   0..99 per slot; below {@code explorePercent} → the second-best primary
     */
    public record Context(Function<String, List<String>> path, BundlePairStats pairs, BundleMargins margins,
                          Function<String, Integer> discountFor, Function<String, Integer> capFor,
                          String giftId, boolean withScore, int explorePercent, IntSupplier exploreRoll) {
    }

    /** What the slots are built against: the target categories in order, the price limit. */
    public record Request(ProductDto anchor, List<String> targets, Set<String> excludeIds, Set<String> excludeTops,
                          boolean addonPriceLimit, int maxAddonPricePercent, int maxSlots) {
    }

    private record Scored(ProductDto p, ScoreDto score, List<String> reasons, String family) {
        double total() {
            return score.total();
        }
    }

    private BundleRanker() {
    }

    public static List<SlotDto> slots(Request req, List<ProductDto> all, Context ctx) {
        if (req.anchor() == null || req.targets() == null || req.targets().isEmpty() || req.maxSlots() <= 0) {
            return List.of();
        }
        ProductDto anchor = req.anchor();
        String anchorTop = top(anchor.categoryId(), ctx.path());
        Map<String, Double> avgSold = averageSold(all, ctx.path());

        record Built(SlotDto slot, double weight) {
        }
        List<Built> built = new ArrayList<>();
        Set<String> seenTargets = new HashSet<>();
        Set<String> used = new HashSet<>();
        for (String target : req.targets()) {
            if (target == null || !seenTargets.add(target)) {
                continue;
            }
            String targetTop = top(target, ctx.path());
            if (targetTop == null || req.excludeTops().contains(targetTop)) {
                continue;
            }
            double pair = ctx.pairs().strength(anchorTop, targetTop);
            List<Scored> scored = new ArrayList<>();
            for (ProductDto p : all) {
                if (!eligible(p, anchor, target, req, ctx)) {
                    continue;
                }
                scored.add(score(anchor, p, pair, avgSold, ctx));
            }
            if (scored.isEmpty()) {
                continue;
            }
            scored.sort(Comparator.comparingDouble(Scored::total).reversed()
                    .thenComparing(s -> s.p().id()));
            SlotDto slot = slot(target, scored, ctx.pairs().percent(anchorTop, targetTop), used, ctx);
            if (slot != null) {
                built.add(new Built(slot, pair * scored.get(0).total()));
            }
        }
        built.sort(Comparator.comparingDouble(Built::weight).reversed());
        return built.stream().limit(req.maxSlots()).map(Built::slot).toList();
    }

    private static boolean eligible(ProductDto p, ProductDto anchor, String target, Request req, Context ctx) {
        if (p.id().equals(anchor.id()) || req.excludeIds().contains(p.id()) || p.id().equals(ctx.giftId())) {
            return false;
        }
        if (p.effectiveStock() <= 0 || p.priceMinor() <= 0 || p.categoryId() == null) {
            return false;
        }
        List<String> path = ctx.path().apply(p.categoryId());
        if (!path.contains(target) || req.excludeTops().contains(path.get(path.size() - 1))) {
            return false;
        }
        if (req.addonPriceLimit()) {
            int pct = Math.max(1, Math.min(100, req.maxAddonPricePercent()));
            if (p.priceMinor() >= anchor.priceMinor() || p.priceMinor() * 100 > anchor.priceMinor() * pct) {
                return false;
            }
        }
        // Keycaps for a keyboard: the switch types must fit when both are known.
        Set<String> as = values(anchor, "stem");
        Set<String> ps = values(p, "stem");
        return as.isEmpty() || ps.isEmpty() || intersects(as, ps);
    }

    private static Scored score(ProductDto anchor, ProductDto p, double pair, Map<String, Double> avgSold,
                                Context ctx) {
        String top = top(p.categoryId(), ctx.path());
        double avg = avgSold.getOrDefault(top, 0.0);
        double demand = Math.sqrt((p.soldCount() + 2.0) / (avg + 2.0));
        if (p.ratingCount() >= 3 && p.ratingAvg() != null) {
            demand *= 1 + 0.05 * (p.ratingAvg() - 4.5);
        }

        List<String> reasons = new ArrayList<>();
        double match = 1;
        Set<String> ac = values(anchor, "color");
        Set<String> pc = values(p, "color");
        if (colorMatch(ac, pc)) {
            match *= 1.3;
            reasons.add(REASON_COLOR);
        } else if (!ac.isEmpty() && !pc.isEmpty() && NEUTRAL.containsAll(ac) && NEUTRAL.containsAll(pc)) {
            match *= 1.1;
        }
        Set<String> at = new HashSet<>(values(anchor, "theme"));
        at.removeAll(NO_THEME);
        if (intersects(at, values(p, "theme"))) {
            match *= 1.15;
        }
        String ab = brandKey(anchor);
        if (!ab.isEmpty() && ab.equals(brandKey(p))) {
            match *= 1.05;
        }
        Double weight = number(anchor, "weight_g");
        if (weight != null && weight <= 55 && intersects(FAST_GLIDE, values(p, "glide"))) {
            match *= 1.1;
        }

        double ratio = anchor.priceMinor() <= 0 ? 1 : (double) p.priceMinor() / anchor.priceMinor();
        double price = ratio < 0.05 ? 0.7 : ratio < 0.08 ? 0.85 : ratio <= 0.30 ? 1.0 : ratio <= 0.50 ? 0.8 : 0.7;
        int stock = p.effectiveStock();
        double stockF = stock >= 3 ? 1.0 : 0.85;
        if (stock == 1) {
            reasons.add(REASON_LAST);
        }
        if (p.soldCount() >= 5 && p.soldCount() >= 2 * avg) {
            reasons.add(REASON_HIT);
        }

        int m = ctx.margins().margin(p.categoryId());
        int d = ctx.discountFor().apply(p.categoryId());
        int mAvg = Math.max(1, ctx.margins().defaultMargin());
        double marginF = Math.max(0.2, Math.min(3.0, Math.max(1, m - d) / (double) mAvg));

        double total = pair * demand * match * price * stockF * marginF;
        return new Scored(p, new ScoreDto(round(total), round(pair), round(demand), round(match), price, stockF,
                round(marginF)), reasons, family(p));
    }

    private static SlotDto slot(String target, List<Scored> scored, int pairPercent, Set<String> used, Context ctx) {
        // Best member of each family, families in score order.
        Map<String, List<Scored>> families = new LinkedHashMap<>();
        for (Scored s : scored) {
            families.computeIfAbsent(s.family(), k -> new ArrayList<>()).add(s);
        }
        List<String> order = families.keySet().stream().filter(f -> !used.contains(f)).toList();
        if (order.isEmpty()) {
            order = new ArrayList<>(families.keySet());
        }
        boolean explore = order.size() > 1 && ctx.explorePercent() > 0
                && ctx.exploreRoll() != null && ctx.exploreRoll().getAsInt() < ctx.explorePercent();
        String primaryFamily = order.get(explore ? 1 : 0);
        used.add(primaryFamily);
        List<Scored> fam = families.get(primaryFamily);
        // Within the model the anchor's colour comes first, even when another colour sells more.
        Scored primary = fam.stream().filter(s -> s.reasons().contains(REASON_COLOR)).findFirst().orElse(fam.get(0));

        List<OfferItemDto> colors = new ArrayList<>();
        Set<String> seenColors = new HashSet<>();
        seenColors.add(firstColor(primary.p()));
        for (Scored s : fam) {
            if (s != primary && colors.size() < MAX_COLORS - 1 && seenColors.add(firstColor(s.p()))) {
                colors.add(item(s, null, ctx));
            }
        }

        List<Scored> others = new ArrayList<>();
        for (String f : families.keySet()) {
            if (!f.equals(primaryFamily)) {
                others.add(families.get(f).get(0));
            }
        }
        List<OfferItemDto> alts = new ArrayList<>();
        Set<String> taken = new HashSet<>();
        if (!primary.reasons().contains(REASON_COLOR)) {
            others.stream().filter(s -> s.reasons().contains(REASON_COLOR)).findFirst()
                    .ifPresent(s -> addAlt(alts, taken, s, ALT_COLOR, ctx));
        }
        long cheaperThan = primary.p().priceMinor() * 80 / 100;
        others.stream().filter(s -> s.p().priceMinor() <= cheaperThan && !taken.contains(s.p().id())).findFirst()
                .ifPresent(s -> addAlt(alts, taken, s, ALT_CHEAPER, ctx));
        String pb = brandKey(primary.p());
        others.stream().filter(s -> !brandKey(s.p()).equals(pb) && !taken.contains(s.p().id())).findFirst()
                .ifPresent(s -> addAlt(alts, taken, s, ALT_BRAND, ctx));
        for (Scored s : others) {
            if (alts.size() >= MAX_ALTERNATIVES) {
                break;
            }
            addAlt(alts, taken, s, null, ctx);
        }

        return new SlotDto(target, categoryName(primary.p(), target), pairPercent, explore,
                item(primary, null, ctx), colors, alts);
    }

    private static void addAlt(List<OfferItemDto> alts, Set<String> taken, Scored s, String kind, Context ctx) {
        if (alts.size() < MAX_ALTERNATIVES && taken.add(s.p().id())) {
            alts.add(item(s, kind, ctx));
        }
    }

    private static OfferItemDto item(Scored s, String kind, Context ctx) {
        return new OfferItemDto(s.p(), ctx.capFor().apply(s.p().categoryId()), List.copyOf(s.reasons()), kind,
                ctx.withScore() ? s.score() : null);
    }

    // ---- helpers ----

    /** Average units sold per product of each top category. */
    static Map<String, Double> averageSold(Collection<ProductDto> all, Function<String, List<String>> path) {
        Map<String, long[]> acc = new HashMap<>();
        for (ProductDto p : all) {
            String t = top(p.categoryId(), path);
            if (t != null) {
                long[] a = acc.computeIfAbsent(t, k -> new long[2]);
                a[0] += p.soldCount();
                a[1]++;
            }
        }
        Map<String, Double> out = new HashMap<>();
        acc.forEach((k, a) -> out.put(k, a[1] == 0 ? 0 : (double) a[0] / a[1]));
        return out;
    }

    static String top(String categoryId, Function<String, List<String>> path) {
        if (categoryId == null) {
            return null;
        }
        List<String> p = path.apply(categoryId);
        return p.isEmpty() ? null : p.get(p.size() - 1);
    }

    /** brand + category + title without colour words: the colours of one model share it. */
    static String family(ProductDto p) {
        String title = p.title() == null ? "" : p.title().toLowerCase(Locale.ROOT);
        title = COLOR_WORDS.matcher(title).replaceAll(" ");
        title = NON_WORD.matcher(title).replaceAll(" ").trim();
        return brandKey(p) + "|" + p.categoryId() + "|" + title;
    }

    static boolean colorMatch(Set<String> a, Set<String> b) {
        for (String c : a) {
            if (!"black".equals(c) && !"multicolor".equals(c) && b.contains(c)) {
                return true;
            }
        }
        return false;
    }

    private static String brandKey(ProductDto p) {
        if (p.brandRef() != null && p.brandRef().id() != null) {
            return p.brandRef().id();
        }
        return p.brand() == null ? "" : p.brand().trim().toLowerCase(Locale.ROOT);
    }

    private static String firstColor(ProductDto p) {
        Set<String> c = values(p, "color");
        return c.isEmpty() ? "" : c.iterator().next();
    }

    private static String categoryName(ProductDto p, String target) {
        List<TagDto> tags = p.tags();
        if (tags == null || tags.isEmpty()) {
            return null;
        }
        for (TagDto t : tags) {
            if (target.equals(t.id())) {
                return t.name();
            }
        }
        return tags.get(tags.size() - 1).name();
    }

    /** A spec as a set of lower-case strings (arrays and single values alike). */
    static Set<String> values(ProductDto p, String key) {
        if (p.specs() == null) {
            return Set.of();
        }
        Object v = p.specs().get(key);
        if (v == null) {
            return Set.of();
        }
        Set<String> out = new java.util.LinkedHashSet<>();
        if (v instanceof Collection<?> c) {
            for (Object o : c) {
                if (o != null) {
                    out.add(o.toString().trim().toLowerCase(Locale.ROOT));
                }
            }
        } else {
            out.add(v.toString().trim().toLowerCase(Locale.ROOT));
        }
        out.remove("");
        return out;
    }

    private static Double number(ProductDto p, String key) {
        if (p.specs() == null) {
            return null;
        }
        Object v = p.specs().get(key);
        if (v instanceof Number n) {
            return n.doubleValue();
        }
        if (v instanceof String s) {
            try {
                return Double.parseDouble(s.trim());
            } catch (NumberFormatException e) {
                return null;
            }
        }
        return null;
    }

    private static boolean intersects(Set<String> a, Set<String> b) {
        for (String x : a) {
            if (b.contains(x)) {
                return true;
            }
        }
        return false;
    }

    private static double round(double v) {
        return Math.round(v * 1000) / 1000.0;
    }
}
