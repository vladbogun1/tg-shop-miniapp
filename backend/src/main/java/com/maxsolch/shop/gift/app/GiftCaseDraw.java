package com.maxsolch.shop.gift.app;

import com.maxsolch.shop.gift.app.GiftService.CaseEntry;
import java.util.Arrays;
import java.util.List;
import java.util.Optional;
import java.util.function.Predicate;
import java.util.random.RandomGenerator;

/** The server's draw of a case prize: weights, the low-margin skew, chances. Pure functions. */
final class GiftCaseDraw {

    private GiftCaseDraw() {
    }

    /** Chance in percent with 4 decimals (0.0001 % resolution). */
    public static double chancePercent(long weight, long total) {
        return total <= 0 ? 0 : Math.round(weight * 1_000_000.0 / total) / 10_000.0;
    }

    /**
     * Weighted draw among the prizes that can drop now: discounts always, products when
     * {@code available} (productId → in stock). Empty when none can.
     */
    public static Optional<CaseEntry> draw(List<CaseEntry> items, Predicate<String> available, RandomGenerator random) {
        return draw(items, available, random, 100);
    }

    /**
     * The same draw with product prizes' share set to {@code productPercent} % (an order with a
     * low-margin product, {@link #skewedWeights}); 100 = the usual odds.
     */
    public static Optional<CaseEntry> draw(List<CaseEntry> items, Predicate<String> available, RandomGenerator random,
                                           int productPercent) {
        List<CaseEntry> pool = items.stream()
                .filter(c -> c.weight() > 0 && (c.isDiscount() || available.test(c.productId())))
                .toList();
        long[] weights = skewedWeights(pool, productPercent);
        long total = Arrays.stream(weights).sum();
        if (total <= 0) {
            return Optional.empty();
        }
        long r = random.nextLong(total);
        for (int i = 0; i < pool.size(); i++) {
            r -= weights[i];
            if (r < 0) {
                return Optional.of(pool.get(i));
            }
        }
        return Optional.of(pool.get(pool.size() - 1));
    }

    /**
     * Weights of a pool that can drop now, with all product prizes together making {@code productPercent} %
     * of the total and discount prizes the rest; the ratios inside each group stay (the jackpot is still
     * the rarest product). Unchanged when the share is 100 or the pool has only products or only
     * discounts — there is nothing to move the chance to.
     */
    static long[] skewedWeights(List<CaseEntry> pool, int productPercent) {
        long[] w = pool.stream().mapToLong(CaseEntry::weight).toArray();
        int pct = Math.max(0, Math.min(100, productPercent));
        long products = pool.stream().filter(c -> !c.isDiscount()).mapToLong(CaseEntry::weight).sum();
        long discounts = pool.stream().filter(CaseEntry::isDiscount).mapToLong(CaseEntry::weight).sum();
        if (pct >= 100 || products <= 0 || discounts <= 0) {
            return w;
        }
        // products : discounts = pct : (100 − pct), exact in integers (weights ≤ 10⁶, a tier ≤ ~10⁸).
        for (int i = 0; i < w.length; i++) {
            w[i] = pool.get(i).isDiscount() ? w[i] * (100 - pct) * products : w[i] * pct * discounts;
        }
        return w;
    }
}
