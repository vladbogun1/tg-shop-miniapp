package com.maxsolch.shop.ai.domain;

/**
 * The money of the AI module and the one way to turn it into hryvnias. The fact is micro-USD ({@code long}: a model call
 * costs a fraction of a kopeck, so kopecks would round everything to zero), the rate is fixed on the job when it
 * finishes ({@code rateMilli}: hryvnias per dollar times 1000, 42.5 UAH = 42 500), the shown sum is {@code costMinor}
 * (kopecks), always rounded UP: a stream of tiny calls never sums to zero and the shown number is never below the real one.
 */
public final class AiMoney {

    /** USD cents → micro-USD. */
    private static final long MICRO_PER_CENT = 10_000;

    private AiMoney() {
    }

    public static long microFromCents(long cents) {
        return cents * MICRO_PER_CENT;
    }

    /** micro-USD at the rate (UAH per USD × 1000) → kopecks, rounded up. 0 stays 0. */
    public static long costMinor(long microUsd, int rateMilli) {
        if (microUsd <= 0 || rateMilli <= 0) {
            return 0;
        }
        // kopecks = micro / 1e6 (USD) * rateMilli / 1000 (UAH) * 100 = micro * rateMilli / 1e7
        return Math.ceilDiv(microUsd * rateMilli, 10_000_000L);
    }

    /** USD cents → kopecks at the rate, rounded to the nearest kopeck (a limit shown beside its dollars). */
    public static long centsToMinor(long cents, int rateMilli) {
        return Math.round(cents * (double) rateMilli / 1000.0);
    }

    /** Settings keep the rate in kopecks per dollar (42.00 UAH = 4200); the job keeps it in thousandths. */
    public static int rateMilliFromKopecks(int kopecksPerUsd) {
        return kopecksPerUsd * 10;
    }
}
