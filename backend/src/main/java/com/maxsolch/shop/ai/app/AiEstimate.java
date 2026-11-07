package com.maxsolch.shop.ai.app;

import com.maxsolch.shop.ai.domain.AiFeature;
import com.maxsolch.shop.ai.domain.JobMode;
import com.maxsolch.shop.ai.infra.AiUsageQueries;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.time.Duration;
import java.util.List;

/**
 * What a job will cost and how long it takes, before it starts: p50 and p90 of the last 30 days of the same feature;
 * until there are {@link #MIN_SAMPLE} finished jobs, the constants of the benchmark (a card at medium effort is about
 * 0.20 UAH, an invoice at low about 0.08 UAH). The p90 is also what a running job reserves in the limits.
 * "Thorough" costs twice as much; several subjects cost per subject.
 */
@Service
public class AiEstimate {

    static final int MIN_SAMPLE = 10;
    private static final int SAMPLE = 200;

    /** @param fromHistory true when the numbers come from our own finished jobs, false for the benchmark constants */
    public record Estimate(long p50MicroUsd, long p90MicroUsd, int seconds, boolean fromHistory) {
    }

    private final AiUsageQueries usage;
    private final Clock clock;

    public AiEstimate(AiUsageQueries usage, Clock clock) {
        this.usage = usage;
        this.clock = clock;
    }

    public Estimate of(AiFeature feature, JobMode mode, int items) {
        List<Long> costs = usage.recentCosts(feature, clock.instant().minus(Duration.ofDays(30)), SAMPLE);
        boolean history = costs.size() >= MIN_SAMPLE;
        long[] bench = benchmark(feature);
        long p50 = history ? percentile(costs, 50) : bench[0];
        long p90 = history ? percentile(costs, 90) : bench[1];
        int factor = mode == JobMode.THOROUGH ? 2 : 1;
        int n = Math.max(1, items);
        return new Estimate(p50 * factor * n, p90 * factor * n, seconds(feature) * factor * n, history);
    }

    /** The ceiling of one job: the owner's multiple of the typical (p90) cost of its feature. */
    public long ceilingMicroUsd(AiFeature feature, JobMode mode, int items, int factor) {
        return of(feature, mode, items).p90MicroUsd() * factor;
    }

    /** Nearest-rank percentile of an ascending sample. */
    static long percentile(List<Long> ascending, int p) {
        int rank = (int) Math.ceil(p / 100.0 * ascending.size());
        return ascending.get(Math.max(0, Math.min(ascending.size() - 1, rank - 1)));
    }

    private static long[] benchmark(AiFeature feature) {
        return switch (feature) {
            case CARD, COMPLETION -> new long[]{4_800, 9_000};
            case TRANSLATION -> new long[]{3_000, 6_000};
            case SUPPLY_EXTRACT -> new long[]{1_900, 4_000};
            case SUPPLY_MATCH -> new long[]{1_000, 2_000};
            case SEARCH_TEST -> new long[]{0, 0};
        };
    }

    private static int seconds(AiFeature feature) {
        return switch (feature) {
            case CARD, COMPLETION -> 60;
            case TRANSLATION -> 30;
            case SUPPLY_EXTRACT, SUPPLY_MATCH -> 40;
            case SEARCH_TEST -> 5;
        };
    }
}
