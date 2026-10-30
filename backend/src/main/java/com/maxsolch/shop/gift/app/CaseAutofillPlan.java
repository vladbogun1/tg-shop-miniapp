package com.maxsolch.shop.gift.app;

import com.maxsolch.shop.gift.domain.GiftCaseItem;
import com.maxsolch.shop.gift.domain.GiftCaseTier;
import com.maxsolch.shop.gift.app.GiftDtos.AutofillDto;
import com.maxsolch.shop.gift.app.GiftDtos.DraftItemDto;
import com.maxsolch.shop.catalog.app.ProductDto;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.EnumMap;
import java.util.EnumSet;
import java.util.HashMap;
import java.util.HashSet;
import java.util.IdentityHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.SplittableRandom;
import java.util.function.DoubleUnaryOperator;

/**
 * The arithmetic of «Автособрать» ({@link CaseAutofill}): price bands, chances tilted to the target cost, the
 * prize choice. Pure functions over a catalog snapshot — no services, unit-tested on their own.
 */
final class CaseAutofillPlan {

    private CaseAutofillPlan() {
    }

    static final int TOTAL_WEIGHT = 100 * GiftService.CASE_WEIGHT_PER_PERCENT;

    /** Price bands as shares of the threshold, [from, to). */
    static final Map<GiftCaseItem.Rarity, double[]> BANDS = new EnumMap<>(Map.of(
            GiftCaseItem.Rarity.COMMON, new double[]{0.03, 0.12},
            GiftCaseItem.Rarity.RARE, new double[]{0.12, 0.30},
            GiftCaseItem.Rarity.EPIC, new double[]{0.30, 0.60},
            GiftCaseItem.Rarity.LEGENDARY, new double[]{0.60, 1.20},
            GiftCaseItem.Rarity.GOLD, new double[]{1.20, 1000}));
    /** Base chance of each rarity, %, before tilting to the target cost. */
    static final Map<GiftCaseItem.Rarity, Double> BASE_SHARE = new EnumMap<>(Map.of(
            GiftCaseItem.Rarity.COMMON, 70.0,
            GiftCaseItem.Rarity.RARE, 22.0,
            GiftCaseItem.Rarity.EPIC, 6.0,
            GiftCaseItem.Rarity.LEGENDARY, 1.9,
            GiftCaseItem.Rarity.GOLD, 0.1));
    static final double CAP_GOLD = 0.5;
    static final double CAP_LEGENDARY = 3;
    static final double MIN_COMMON = 50;
    static final int MIN_GOLD_WEIGHT = 10;

    static int defaultCostShare(GiftCaseTier.Tier tier) {
        return switch (tier) {
            case BRONZE -> 60; // the cheapest consumable (~150 ₴) already costs more than half the margin at 1500 ₴
            case SILVER -> 50;
            case GOLD -> 60;
        };
    }

    /** A catalog product as the autofill sees it. */
    record Candidate(ProductDto p, String rootSlug, String rootName) {
        long price() {
            return p.priceMinor();
        }
    }

    /** Everything the pure part of the algorithm needs. */
    record Input(GiftCaseTier.Tier tier, long thresholdMinor, int marginPercent, int costShare, int prizes,
                 int discounts, boolean jackpot, List<Candidate> pool, List<Candidate> superPool,
                 List<DraftItemDto> locked, long seed, double monthlyCases) {
    }

    // ---- the pure part (unit-tested) ----

    static AutofillDto build(Input in) {
        SplittableRandom rnd = new SplittableRandom(in.seed());
        long T = in.thresholdMinor();
        List<String> warnings = new ArrayList<>();
        List<DraftItemDto> items = new ArrayList<>(in.locked());

        // Slots per rarity, then minus what is locked.
        Map<GiftCaseItem.Rarity, Integer> slots = new EnumMap<>(GiftCaseItem.Rarity.class);
        int jackpot = in.jackpot() ? 1 : 0;
        int rest = in.prizes() - jackpot;
        int l = rest >= 5 ? 1 : 0;
        int e = rest >= 4 ? Math.max(1, (int) Math.round(rest * 0.15)) : 0;
        int remaining = rest - l - e;
        int r = (int) Math.floor(remaining * 0.45);
        slots.put(GiftCaseItem.Rarity.COMMON, remaining - r);
        slots.put(GiftCaseItem.Rarity.RARE, r);
        slots.put(GiftCaseItem.Rarity.EPIC, e);
        slots.put(GiftCaseItem.Rarity.LEGENDARY, l);
        slots.put(GiftCaseItem.Rarity.GOLD, jackpot);
        Map<GiftCaseItem.Rarity, Integer> discountSlots = new EnumMap<>(GiftCaseItem.Rarity.class);
        GiftCaseItem.Rarity[] order = {GiftCaseItem.Rarity.COMMON, GiftCaseItem.Rarity.RARE};
        for (int k = 0, placed = 0; placed < in.discounts() && k < in.discounts() * 4; k++) {
            GiftCaseItem.Rarity rr = order[k % 2];
            if (slots.get(rr) - discountSlots.getOrDefault(rr, 0) > 0) {
                discountSlots.merge(rr, 1, Integer::sum);
                placed++;
            }
        }
        for (DraftItemDto x : in.locked()) {
            GiftCaseItem.Rarity rr = GiftCaseItem.Rarity.valueOf(x.rarity());
            if (slots.getOrDefault(rr, 0) <= 0) {
                continue;
            }
            slots.merge(rr, -1, Integer::sum);
            if ("DISCOUNT".equals(x.kind()) && discountSlots.getOrDefault(rr, 0) > 0) {
                discountSlots.merge(rr, -1, Integer::sum);
            }
            discountSlots.computeIfPresent(rr, (k, v) -> Math.min(v, slots.get(rr)));
        }

        // The jackpot: the dearest super-category product in stock.
        Set<String> taken = new HashSet<>();
        Map<String, Integer> perCategory = new HashMap<>();
        if (slots.get(GiftCaseItem.Rarity.GOLD) > 0) {
            in.superPool().stream()
                    .filter(c -> c.p().effectiveStock() > 0)
                    .max(Comparator.comparingLong(Candidate::price))
                    .ifPresentOrElse(c -> {
                        items.add(productItem(c, GiftCaseItem.Rarity.GOLD, 0));
                        taken.add(c.p().id());
                    }, () -> warnings.add("Нет товара для джекпота: в суперпризовых категориях ничего нет в наличии"));
        }

        double maxSold = in.pool().stream().mapToDouble(c -> c.p().soldCount()).max().orElse(0);
        for (GiftCaseItem.Rarity rr : List.of(GiftCaseItem.Rarity.LEGENDARY, GiftCaseItem.Rarity.EPIC,
                GiftCaseItem.Rarity.RARE, GiftCaseItem.Rarity.COMMON)) {
            int need = slots.get(rr) - discountSlots.getOrDefault(rr, 0);
            double[] band = BANDS.get(rr);
            // A frequent prize needs stock for a month of cases: ask for it first, then take what there is.
            int slotsHere = Math.max(1, slots.get(rr));
            int monthStock = (int) Math.ceil(in.monthlyCases() * BASE_SHARE.get(rr) / 100 / slotsHere);
            List<Candidate> picked = new ArrayList<>();
            for (int stockNeed : new int[]{monthStock, 0}) {
                if (picked.size() < need) {
                    picked.addAll(pick(in.pool(), taken, perCategory, rr, T, band[0], band[1], need - picked.size(),
                            stockNeed, maxSold, rnd));
                }
            }
            if (picked.size() < need) {
                picked.addAll(pick(in.pool(), taken, perCategory, rr, T, band[0] * 0.67, band[1] * 1.5,
                        need - picked.size(), 0, maxSold, rnd));
            }
            picked.forEach(c -> items.add(productItem(c, rr, 0)));
            int shortage = need - picked.size();
            int discountsHere = discountSlots.getOrDefault(rr, 0);
            if (shortage > 0) {
                if (rr == GiftCaseItem.Rarity.COMMON || rr == GiftCaseItem.Rarity.RARE) {
                    discountsHere += shortage;
                    warnings.add("Не хватило товаров «" + rarityName(rr) + "» по цене — " + shortage
                            + " заменено скидками");
                } else {
                    warnings.add("Нет товаров «" + rarityName(rr) + "» по цене " + uah(Math.round(T * band[0]))
                            + "–" + uah(Math.round(T * band[1])) + " — слот пропущен");
                }
            }
            for (int k = 0; k < discountsHere; k++) {
                double share = rr == GiftCaseItem.Rarity.COMMON ? 0.05 : 0.15;
                // Rounded down: a common discount must stay cheaper than a common product (75 ₴ → 50 ₴, not 100 ₴).
                int value = (int) Math.max(50, Math.floor(share * T / 100.0 / 50) * 50);
                items.add(discountItem(rr, value));
            }
        }

        // Chances.
        long target = Math.round(T * in.marginPercent() / 100.0 * in.costShare() / 100.0);
        Map<GiftCaseItem.Rarity, List<DraftItemDto>> groups = new EnumMap<>(GiftCaseItem.Rarity.class);
        items.stream().filter(DraftItemDto::active)
                .forEach(x -> groups.computeIfAbsent(GiftCaseItem.Rarity.valueOf(x.rarity()), k -> new ArrayList<>()).add(x));
        Map<GiftCaseItem.Rarity, Double> avgCost = new EnumMap<>(GiftCaseItem.Rarity.class);
        groups.forEach((rr, list) -> avgCost.put(rr, list.stream()
                .mapToDouble(x -> cost(x, T, in.marginPercent())).average().orElse(0)));
        DoubleUnaryOperator costAt = lambda -> expected(shares(groups.keySet(), lambda), avgCost);
        double lo = 0.3; // stingier than this the rare prizes all but vanish (≈ 9 % for all of them)
        double hi = 5;
        if (groups.isEmpty()) {
            warnings.add("Ничего не подобрано: проверьте категории и наличие");
        } else if (costAt.applyAsDouble(hi) < target) {
            lo = hi;
            warnings.add("Цель не достигается: даже с щедрыми шансами кейс обходится в "
                    + uah(Math.round(costAt.applyAsDouble(hi))) + " — добавьте дороже призы");
        } else if (costAt.applyAsDouble(lo) > target) {
            hi = lo;
            warnings.add("Кейс дороже цели даже со скупыми шансами редких: "
                    + uah(Math.round(costAt.applyAsDouble(lo))) + " — дешевле обычные призы, меньше скидок или щедрость выше");
        } else {
            for (int k = 0; k < 60; k++) {
                double mid = Math.sqrt(lo * hi);
                if (costAt.applyAsDouble(mid) < target) {
                    lo = mid;
                } else {
                    hi = mid;
                }
            }
        }
        Map<GiftCaseItem.Rarity, Double> share = shares(groups.keySet(), (lo + hi) / 2);
        List<DraftItemDto> weighted = weights(items, groups, share);
        long avgPrize = 0;
        double avgCostMinor = 0;
        for (DraftItemDto x : weighted) {
            if (!x.active()) {
                continue;
            }
            double w = x.weight() / (double) TOTAL_WEIGHT;
            if ("PRODUCT".equals(x.kind())) {
                avgPrize += Math.round(w * x.priceMinor());
            }
            avgCostMinor += w * cost(x, T, in.marginPercent());
        }
        return new AutofillDto(in.tier().name(), weighted, avgPrize, Math.round(avgCostMinor),
                Math.round(T * in.marginPercent() / 100.0), target, warnings);
    }

    /** The best {@code need} products of a band, one category not crowding the others out. */
    private static List<Candidate> pick(List<Candidate> pool, Set<String> taken, Map<String, Integer> perCategory,
                                        GiftCaseItem.Rarity rarity, long T, double from, double to, int need,
                                        int minStock, double maxSold, SplittableRandom rnd) {
        List<Candidate> out = new ArrayList<>();
        if (need <= 0) {
            return out;
        }
        Map<String, Double> score = new HashMap<>();
        List<Candidate> band = pool.stream()
                .filter(c -> !taken.contains(c.p().id()) && c.price() >= T * from && c.price() < T * to
                        && c.p().effectiveStock() >= minStock)
                .toList();
        band.forEach(c -> score.put(c.p().id(), score(c, rarity, T, maxSold, rnd.nextDouble() * 0.35)));
        List<Candidate> left = new ArrayList<>(band);
        while (out.size() < need && !left.isEmpty()) {
            Candidate best = left.stream().max(Comparator.comparingDouble(
                    c -> score.get(c.p().id()) - 0.25 * perCategory.getOrDefault(c.rootSlug(), 0))).orElseThrow();
            left.remove(best);
            out.add(best);
            taken.add(best.p().id());
            perCategory.merge(best.rootSlug(), 1, Integer::sum);
        }
        return out;
    }

    static double score(Candidate c, GiftCaseItem.Rarity rarity, long T, double maxSold, double jitter) {
        double pop = maxSold <= 0 ? 0 : Math.log1p(c.p().soldCount()) / Math.log1p(maxSold);
        double stock = Math.min(1, c.p().effectiveStock() / 10.0);
        double[] band = BANDS.get(rarity);
        double hi = rarity == GiftCaseItem.Rarity.GOLD ? band[0] * 2 : band[1];
        // Ordinary prizes lean to the cheap end: they drop most and make the case's cost.
        double centre = rarity == GiftCaseItem.Rarity.COMMON ? band[0] + (hi - band[0]) / 3 : (band[0] + hi) / 2;
        double close = Math.max(0, 1 - Math.abs(c.price() / (double) T - centre) / ((hi - band[0]) / 2 + 1e-9));
        return 0.35 * pop + 0.2 * stock + 0.25 * close + jitter;
    }

    /** Chances of the present rarities, %, tilted by {@code lambda} to the rare ones, with the caps. */
    static Map<GiftCaseItem.Rarity, Double> shares(Set<GiftCaseItem.Rarity> present, double lambda) {
        Map<GiftCaseItem.Rarity, Double> s = new EnumMap<>(GiftCaseItem.Rarity.class);
        double sum = 0;
        for (GiftCaseItem.Rarity rr : present) {
            double v = BASE_SHARE.get(rr) * Math.pow(lambda, rr.ordinal());
            s.put(rr, v);
            sum += v;
        }
        if (sum <= 0) {
            return s;
        }
        for (GiftCaseItem.Rarity rr : present) {
            s.put(rr, s.get(rr) * 100 / sum);
        }
        if (present.size() == 1) {
            return s;
        }
        // A capped rarity is pinned at its cap, the free ones share what is left; repeat while a cap breaks.
        Map<GiftCaseItem.Rarity, Double> caps = Map.of(GiftCaseItem.Rarity.GOLD, CAP_GOLD,
                GiftCaseItem.Rarity.LEGENDARY, CAP_LEGENDARY);
        Set<GiftCaseItem.Rarity> pinned = EnumSet.noneOf(GiftCaseItem.Rarity.class);
        for (boolean changed = true; changed; ) {
            changed = false;
            for (var c : caps.entrySet()) {
                if (s.containsKey(c.getKey()) && !pinned.contains(c.getKey()) && s.get(c.getKey()) > c.getValue()) {
                    s.put(c.getKey(), c.getValue());
                    pinned.add(c.getKey());
                    changed = true;
                }
            }
            if (changed) {
                rescaleFree(s, pinned);
            }
        }
        if (s.containsKey(GiftCaseItem.Rarity.COMMON) && s.get(GiftCaseItem.Rarity.COMMON) < MIN_COMMON) {
            s.put(GiftCaseItem.Rarity.COMMON, MIN_COMMON);
            pinned.add(GiftCaseItem.Rarity.COMMON);
            rescaleFree(s, pinned); // only shrinks the rest: the caps hold
        }
        return s;
    }

    /** The unpinned rarities share {@code 100 − pinned} in their current proportions. */
    private static void rescaleFree(Map<GiftCaseItem.Rarity, Double> s, Set<GiftCaseItem.Rarity> pinned) {
        double fixed = 0;
        double free = 0;
        for (var e : s.entrySet()) {
            if (pinned.contains(e.getKey())) {
                fixed += e.getValue();
            } else {
                free += e.getValue();
            }
        }
        if (free <= 0) {
            return;
        }
        double scale = (100 - fixed) / free;
        s.replaceAll((k, v) -> pinned.contains(k) ? v : v * scale);
    }

    private static double expected(Map<GiftCaseItem.Rarity, Double> share, Map<GiftCaseItem.Rarity, Double> avgCost) {
        double sum = 0;
        for (var e : share.entrySet()) {
            sum += e.getValue() / 100 * avgCost.getOrDefault(e.getKey(), 0.0);
        }
        return sum;
    }

    /** Equal split inside a rarity; the sum is exactly {@link #TOTAL_WEIGHT}. */
    private static List<DraftItemDto> weights(List<DraftItemDto> items, Map<GiftCaseItem.Rarity, List<DraftItemDto>> groups,
                                              Map<GiftCaseItem.Rarity, Double> share) {
        Map<DraftItemDto, Integer> w = new IdentityHashMap<>(); // two equal discounts are two prizes
        long sum = 0;
        for (var g : groups.entrySet()) {
            double each = share.getOrDefault(g.getKey(), 0.0) / 100 * TOTAL_WEIGHT / g.getValue().size();
            for (DraftItemDto x : g.getValue()) {
                int v = (int) Math.round(each);
                if (g.getKey() == GiftCaseItem.Rarity.GOLD) {
                    v = Math.max(MIN_GOLD_WEIGHT, v);
                }
                w.put(x, v);
                sum += v;
            }
        }
        if (!w.isEmpty() && sum != TOTAL_WEIGHT) {
            DraftItemDto fix = groups.values().stream().flatMap(List::stream)
                    .max(Comparator.comparingInt(w::get)).orElseThrow();
            w.put(fix, (int) (w.get(fix) + TOTAL_WEIGHT - sum));
        }
        List<DraftItemDto> out = new ArrayList<>();
        for (DraftItemDto x : items) {
            out.add(withWeight(x, w.getOrDefault(x, 0)));
        }
        out.sort(Comparator.comparingInt((DraftItemDto x) -> GiftCaseItem.Rarity.valueOf(x.rarity()).ordinal())
                .thenComparing(DraftItemDto::kind, Comparator.reverseOrder())
                .thenComparingLong(DraftItemDto::priceMinor));
        return out;
    }

    /** What a prize costs the shop, kopecks. */
    static double cost(DraftItemDto x, long T, int marginPercent) {
        if ("DISCOUNT".equals(x.kind())) {
            return x.discountPercent() > 0 ? T * x.discountPercent() / 100.0 : x.discountUah() * 100.0;
        }
        return x.priceMinor() * (1 - marginPercent / 100.0);
    }

    static DraftItemDto productItem(Candidate c, GiftCaseItem.Rarity rarity, int weight) {
        ProductDto p = c.p();
        return new DraftItemDto(null, "PRODUCT", p.id(), p.title(), GiftService.image(p), p.priceMinor(),
                p.effectiveStock(), true, c.rootName(), 0, 0, rarity.name(), weight, true);
    }

    static DraftItemDto discountItem(GiftCaseItem.Rarity rarity, int uah) {
        return new DraftItemDto(null, "DISCOUNT", null, discountTitle(0, uah), null, 0, 0, true, null, 0, uah,
                rarity.name(), 0, true);
    }

    static DraftItemDto withWeight(DraftItemDto x, int weight) {
        return new DraftItemDto(x.id(), x.kind(), x.productId(), x.title(), x.imageUrl(), x.priceMinor(), x.stock(),
                x.productActive(), x.category(), x.discountPercent(), x.discountUah(), x.rarity(), weight, x.active());
    }

    static String discountTitle(int percent, int uah) {
        return percent > 0 ? "Скидка " + percent + " %" : "Скидка " + uah + " ₴";
    }

    static int round50(double uah) {
        return (int) Math.max(50, Math.round(uah / 50) * 50);
    }

    static String uah(long minor) {
        return Math.round(minor / 100.0) + " ₴";
    }

    static String rarityName(GiftCaseItem.Rarity rr) {
        return switch (rr) {
            case COMMON -> "обычный";
            case RARE -> "редкий";
            case EPIC -> "эпический";
            case LEGENDARY -> "легендарный";
            case GOLD -> "джекпот";
        };
    }

    static int clamp(int v, int min, int max) {
        return Math.max(min, Math.min(max, v));
    }
}
