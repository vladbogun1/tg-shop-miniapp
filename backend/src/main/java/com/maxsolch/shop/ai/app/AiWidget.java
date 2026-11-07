package com.maxsolch.shop.ai.app;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.maxsolch.shop.ai.domain.AiMoney;
import com.maxsolch.shop.platform.security.AdminAccess;
import com.maxsolch.shop.platform.web.CurrentActor;
import org.springframework.stereotype.Service;

import static com.fasterxml.jackson.annotation.JsonInclude.Include.NON_NULL;

/**
 * The one line of the dashboard: for the owner «Расход 19 из 420 ₴ · ждёт проверки 14», for an admin «ИИ можно
 * запускать · ждёт проверки 14». The money keys are absent from the answer to an admin without the finance right.
 */
@Service
public class AiWidget {

    /** @param canRun the AI is set up and on, some feature is on and no limit is used up: starting makes sense */
    public record Widget(boolean configured, boolean enabled, boolean canRun, int running, int review, int problems,
                         @JsonInclude(NON_NULL) Long monthSpentMinor, @JsonInclude(NON_NULL) Long monthLimitMinor) {
    }

    private final AiSummary summary;
    private final AiLimits limits;
    private final AiPolicy policy;
    private final AdminAccess access;
    private final CurrentActor actor;

    public AiWidget(AiSummary summary, AiLimits limits, AiPolicy policy, AdminAccess access, CurrentActor actor) {
        this.summary = summary;
        this.limits = limits;
        this.policy = policy;
        this.access = access;
        this.actor = actor;
    }

    public Widget widget() {
        AiSummary.Summary s = summary.summary();
        boolean canRun = s.configured() && s.enabled() && !s.featuresOn().isEmpty() && s.limit() == null;
        boolean finance = access.canSeeFinance(actor.userId());
        int rate = policy.rateMilli();
        return new Widget(s.configured(), s.enabled(), canRun, s.running(), s.review(), s.problems(),
                finance ? AiMoney.costMinor(limits.spend().monthMicroUsd(), rate) : null,
                finance ? AiMoney.costMinor(policy.monthLimitMicro(), rate) : null);
    }
}
