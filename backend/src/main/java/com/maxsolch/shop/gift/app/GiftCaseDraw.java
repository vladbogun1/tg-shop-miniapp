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
     * low-margin product); 100 = the usual odds. Chances are {@link #liveWeights}.
     */
    public static Optional<CaseEntry> draw(List<CaseEntry> items, Predicate<String> available, RandomGenerator random,
                                           int productPercent) {
        long[] weights = liveWeights(items, available, productPercent);
        long total = Arrays.stream(weights).sum();
        if (total <= 0) {
            return Optional.empty();
        }
        long r = random.nextLong(total);
        for (int i = 0; i < items.size(); i++) {
            r -= weights[i];
            if (r < 0) {
                return Optional.of(items.get(i));
            }
        }
        throw new IllegalStateException("draw ran past the total");
    }

    /**
     * Weights the draw uses, one per item (0 = cannot drop now): a product that cannot drop (out of
     * stock, over the gift limit) gives its chance to the discounts, split in their ratio, so every
     * other product keeps exactly the chance the admin set — a sold-out prize never makes the rest drop
     * more often. A tier without discounts has nowhere to move it: its products share the chance.
     *
     * <p>{@code productPercent} &lt; 100 (an order with a low-margin product): all product prizes together
     * get that share of the tier as configured and the discounts the rest; the ratios inside each group stay
     * (the jackpot is still the rarest product). The product that cannot drop gives its part of that share
     * to the discounts too. Exact in integers (weights ≤ 10⁶, a tier ≤ ~10⁸, a result ≤ ~10¹⁶).
     */
    static long[] liveWeights(List<CaseEntry> items, Predicate<String> available, int productPercent) {
        int n = items.size();
        boolean[] drops = new boolean[n];
        long productsAll = 0;
        long productsGone = 0;
        long discounts = 0;
        for (int i = 0; i < n; i++) {
            CaseEntry c = items.get(i);
            if (c.weight() <= 0) {
                continue;
            }
            if (c.isDiscount()) {
                drops[i] = true;
                discounts += c.weight();
            } else {
                drops[i] = available.test(c.productId());
                productsAll += c.weight();
                productsGone += drops[i] ? 0 : c.weight();
            }
        }
        long[] w = new long[n];
        if (discounts <= 0) {
            // Nothing to give the chance to: the products that can drop share it (the skew has no effect either).
            for (int i = 0; i < n; i++) {
                w[i] = drops[i] ? items.get(i).weight() : 0;
            }
            return w;
        }
        int pct = Math.max(0, Math.min(100, productPercent));
        boolean skew = pct < 100 && productsAll > 0;
        // product : discount multipliers — a product keeps weight × pm, a discount takes its own and its share of the gone.
        long pm = skew ? (long) pct * discounts : discounts;
        long dm = skew ? (100L - pct) * productsAll + (long) pct * productsGone : discounts + productsGone;
        for (int i = 0; i < n; i++) {
            if (drops[i]) {
                w[i] = items.get(i).weight() * (items.get(i).isDiscount() ? dm : pm);
            }
        }
        return w;
    }
}
