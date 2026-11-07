package com.maxsolch.shop.ai.app;

import com.maxsolch.shop.ai.domain.AiError;
import com.maxsolch.shop.ai.domain.AiFeature;
import com.maxsolch.shop.ai.domain.AiMoney;
import com.maxsolch.shop.ai.domain.AiScope;
import com.maxsolch.shop.ai.domain.ChatModel;
import com.maxsolch.shop.audit.app.AdminAuditService;
import com.maxsolch.shop.platform.error.DomainException;
import org.springframework.stereotype.Service;

import java.util.List;

/**
 * The state of the AI for the owner's settings screen (the finance right is checked by the controller): is the model
 * key set, what is spent today and this month against the limits, how much of the free search is left, which search
 * providers work, how many jobs wait or run. Plus the two buttons: «Проверить поиск» and «Остановить всё».
 */
@Service
public class AiState {

    /** Money in micro-USD with the rate for hryvnias; limits 0 = none. */
    public record Money(long spentMicroUsd, long limitMicroUsd, long spentMinor) {
    }

    public record SerperState(int used, int free, boolean paidAllowed) {
    }

    public record State(boolean configured, String model, boolean enabled, Money day, Money month,
                        long reservesMicroUsd, int rateMilli, SerperState serper,
                        List<WebSearch.ProviderState> providers, int running, long lostRows) {
    }

    private final AiPolicy policy;
    private final AiLimits limits;
    private final WebSearch search;
    private final ChatModel model;
    private final AiJobLifecycle lifecycle;
    private final AdminAuditService audit;
    private final AiUsageLog log;

    public AiState(AiPolicy policy, AiLimits limits, WebSearch search, ChatModel model, AiJobLifecycle lifecycle,
                   AdminAuditService audit, AiUsageLog log) {
        this.policy = policy;
        this.limits = limits;
        this.search = search;
        this.model = model;
        this.lifecycle = lifecycle;
        this.audit = audit;
        this.log = log;
    }

    public State state() {
        AiLimits.Spend spend = limits.spend();
        int rate = policy.rateMilli();
        return new State(model.configured(), model.modelName(), policy.enabled(),
                new Money(spend.dayMicroUsd(), policy.dayLimitMicro(), AiMoney.costMinor(spend.dayMicroUsd(), rate)),
                new Money(spend.monthMicroUsd(), policy.monthLimitMicro(),
                        AiMoney.costMinor(spend.monthMicroUsd(), rate)),
                spend.reservesMicroUsd(), rate,
                new SerperState(policy.serperUsed(), AiPolicy.SERPER_FREE, policy.serperPaidAllowed()),
                search.providers(), lifecycle.running(), log.lostRows());
    }

    /** One query through the chain, as the model would get it — to check the providers from the settings. */
    public WebSearch.Found testSearch(String query) {
        if (query == null || query.isBlank() || query.length() > 300) {
            throw new DomainException.BadRequest(AiError.BAD_REQUEST, "query");
        }
        return search.search(AiScope.of(AiFeature.SEARCH_TEST), query.trim(), ResearchTools.HITS);
    }

    /** Stops what runs now and drops what waits; returns how many jobs were touched. */
    public int stopRunning() {
        int n = lifecycle.stopAll();
        audit.record("AI_STOP_ALL", "AI", null, "ИИ: остановлены все задачи (" + n + ")");
        return n;
    }
}
