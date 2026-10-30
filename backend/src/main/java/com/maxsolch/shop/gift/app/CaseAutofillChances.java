package com.maxsolch.shop.gift.app;

import static com.maxsolch.shop.gift.app.CaseAutofillPlan.BASE_SHARE;
import static com.maxsolch.shop.gift.app.CaseAutofillPlan.CAP_GOLD;
import static com.maxsolch.shop.gift.app.CaseAutofillPlan.CAP_LEGENDARY;
import static com.maxsolch.shop.gift.app.CaseAutofillPlan.MIN_COMMON;
import static com.maxsolch.shop.gift.app.CaseAutofillPlan.MIN_GOLD_WEIGHT;
import static com.maxsolch.shop.gift.app.CaseAutofillPlan.TOTAL_WEIGHT;
import static com.maxsolch.shop.gift.app.CaseAutofillPlan.uah;
import static com.maxsolch.shop.gift.app.CaseAutofillPlan.withWeight;

import com.maxsolch.shop.gift.app.GiftDtos.DraftItemDto;
import com.maxsolch.shop.gift.domain.GiftCaseItem;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.EnumMap;
import java.util.EnumSet;
import java.util.IdentityHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.DoubleUnaryOperator;

/**
 * The chances half of {@link CaseAutofillPlan}: rarity shares tilted to hit the target cost, with the caps,
 * and their split into prize weights. Pure functions.
 */
final class CaseAutofillChances {

    private CaseAutofillChances() {
    }

    /**
     * The tilt to the rare rarities whose expected cost meets {@code target} (bisection between stingy and
     * generous); a target out of reach is a warning and the nearest end.
     */
    static double tilt(Set<GiftCaseItem.Rarity> present, Map<GiftCaseItem.Rarity, Double> avgCost, long target,
                       List<String> warnings) {
        DoubleUnaryOperator costAt = lambda -> expected(shares(present, lambda), avgCost);
        double lo = 0.3; // stingier than this the rare prizes all but vanish (≈ 9 % for all of them)
        double hi = 5;
        if (present.isEmpty()) {
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
        return (lo + hi) / 2;
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
    static List<DraftItemDto> weights(List<DraftItemDto> items, Map<GiftCaseItem.Rarity, List<DraftItemDto>> groups,
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
}
