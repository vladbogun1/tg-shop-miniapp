package com.maxsolch.shop.gift.app;

import com.maxsolch.shop.gift.domain.GiftCaseItem;
import com.maxsolch.shop.gift.domain.GiftCaseTier;
import com.maxsolch.shop.gift.app.GiftDtos.AutofillDto;
import com.maxsolch.shop.gift.app.GiftDtos.DraftItemDto;
import com.maxsolch.shop.catalog.app.ProductDto;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.EnumMap;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.SplittableRandom;

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
        Map<GiftCaseItem.Rarity, Integer> slots = slots(in);
        Map<GiftCaseItem.Rarity, Integer> discountSlots = discountSlots(in.discounts(), slots);
        takeLocked(in.locked(), slots, discountSlots);

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
            fillRarity(in, rr, slots.get(rr), discountSlots.getOrDefault(rr, 0), taken, perCategory, maxSold, rnd,
                    items, warnings);
        }

        // Chances.
        long target = Math.round(T * in.marginPercent() / 100.0 * in.costShare() / 100.0);
        Map<GiftCaseItem.Rarity, List<DraftItemDto>> groups = new EnumMap<>(GiftCaseItem.Rarity.class);
        items.stream().filter(DraftItemDto::active)
                .forEach(x -> groups.computeIfAbsent(GiftCaseItem.Rarity.valueOf(x.rarity()), k -> new ArrayList<>()).add(x));
        Map<GiftCaseItem.Rarity, Double> avgCost = new EnumMap<>(GiftCaseItem.Rarity.class);
        groups.forEach((rr, list) -> avgCost.put(rr, list.stream()
                .mapToDouble(x -> cost(x, T, in.marginPercent())).average().orElse(0)));
        double lambda = CaseAutofillChances.tilt(groups.keySet(), avgCost, target, warnings);
        Map<GiftCaseItem.Rarity, Double> share = CaseAutofillChances.shares(groups.keySet(), lambda);
        List<DraftItemDto> weighted = CaseAutofillChances.weights(items, groups, share);
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

    /** Prize slots per rarity: a jackpot if asked, a legendary from 5, ~15 % epic from 4, 45 % of the rest rare. */
    private static Map<GiftCaseItem.Rarity, Integer> slots(Input in) {
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
        return slots;
    }

    /** The discount prizes, alternating common and rare while those have slots. */
    private static Map<GiftCaseItem.Rarity, Integer> discountSlots(int discounts, Map<GiftCaseItem.Rarity, Integer> slots) {
        Map<GiftCaseItem.Rarity, Integer> discountSlots = new EnumMap<>(GiftCaseItem.Rarity.class);
        GiftCaseItem.Rarity[] order = {GiftCaseItem.Rarity.COMMON, GiftCaseItem.Rarity.RARE};
        for (int k = 0, placed = 0; placed < discounts && k < discounts * 4; k++) {
            GiftCaseItem.Rarity rr = order[k % 2];
            if (slots.get(rr) - discountSlots.getOrDefault(rr, 0) > 0) {
                discountSlots.merge(rr, 1, Integer::sum);
                placed++;
            }
        }
        return discountSlots;
    }

    /** Locked prizes take their slots (and discount slots) first. */
    private static void takeLocked(List<DraftItemDto> locked, Map<GiftCaseItem.Rarity, Integer> slots,
                                   Map<GiftCaseItem.Rarity, Integer> discountSlots) {
        for (DraftItemDto x : locked) {
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
    }

    /** Products of one rarity for its slots; a common/rare shortage becomes discounts, a dearer one a warning. */
    private static void fillRarity(Input in, GiftCaseItem.Rarity rr, int slotCount, int discountCount, Set<String> taken,
                                   Map<String, Integer> perCategory, double maxSold, SplittableRandom rnd,
                                   List<DraftItemDto> items, List<String> warnings) {
        long T = in.thresholdMinor();
        int need = slotCount - discountCount;
        double[] band = BANDS.get(rr);
        // A frequent prize needs stock for a month of cases: ask for it first, then take what there is.
        int slotsHere = Math.max(1, slotCount);
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
        int discountsHere = discountCount;
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
