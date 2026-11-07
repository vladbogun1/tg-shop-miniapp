package com.maxsolch.shop.ai.app;

import com.maxsolch.shop.ai.domain.AiBatch;
import com.maxsolch.shop.ai.domain.AiFeature;
import com.maxsolch.shop.ai.domain.AiMoney;
import com.maxsolch.shop.ai.domain.JobMode;
import org.springframework.stereotype.Service;

/**
 * «Запустить пакет из N?»: how long and, for the finance right, how much, and whether the limit left is enough. The
 * time counts the parallelism of a batch of this size; the money fields are absent for an admin without the right.
 */
@Service
public class AiBatchEstimate {

    /** @param fits false when the expected cost (p90) is more than the room left under the day and month limits */
    public record Dto(int count, int minutes, boolean fits, Long p50Minor, Long p90Minor, Long roomMinor) {
    }

    private final AiEstimate estimate;
    private final AiLimits limits;
    private final AiPolicy policy;

    public AiBatchEstimate(AiEstimate estimate, AiLimits limits, AiPolicy policy) {
        this.estimate = estimate;
        this.limits = limits;
        this.policy = policy;
    }

    public Dto of(AiFeature feature, JobMode mode, int count, boolean finance) {
        AiEstimate.Estimate one = estimate.of(feature, mode, 1);
        int parallel = count >= AiBatch.BIG ? AiBatch.PARALLEL_BIG : AiBatch.PARALLEL_SMALL;
        int seconds = (int) Math.ceil((double) count / parallel) * one.seconds();
        int minutes = Math.max(1, (int) Math.ceil(seconds / 60.0));
        long p50 = one.p50MicroUsd() * count;
        long p90 = one.p90MicroUsd() * count;
        long room = limits.remainingMicro();
        boolean fits = room < 0 || p90 <= room;
        if (!finance) {
            return new Dto(count, minutes, fits, null, null, null);
        }
        int rate = policy.rateMilli();
        return new Dto(count, minutes, fits, AiMoney.costMinor(p50, rate), AiMoney.costMinor(p90, rate),
                room < 0 ? null : AiMoney.costMinor(room, rate));
    }
}
