package com.maxsolch.shop.ai.app;

import com.maxsolch.shop.ai.domain.AiEvents;
import com.maxsolch.shop.platform.tx.DomainEvents;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

/**
 * After every job: has the month passed 80 % of its limit, have the free Serper requests passed 80 %? The events
 * go to {@link AiNotifier}, which says each of them once per period; asking again after every job is cheap (two sums).
 */
@Slf4j
@Service
public class AiSpendWatch {

    private static final int PERCENT = 80;

    private final AiLimits limits;
    private final AiPolicy policy;
    private final DomainEvents events;

    public AiSpendWatch(AiLimits limits, AiPolicy policy, DomainEvents events) {
        this.limits = limits;
        this.policy = policy;
        this.events = events;
    }

    public void afterJob() {
        try {
            long limit = policy.monthLimitMicro();
            long spent = limits.spend().monthMicroUsd();
            if (limit > 0 && spent * 100 >= limit * PERCENT) {
                events.publish(new AiEvents.SpendWarning(spent, limit));
            }
            int used = policy.serperUsed();
            if (used * 100 >= AiPolicy.SERPER_FREE * PERCENT && !policy.serperPaidAllowed()) {
                events.publish(new AiEvents.FreeSearchWarning(used, AiPolicy.SERPER_FREE));
            }
        } catch (RuntimeException e) {
            log.warn("ai spend watch failed: {}", e.toString());
        }
    }
}
