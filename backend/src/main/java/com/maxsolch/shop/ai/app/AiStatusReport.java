package com.maxsolch.shop.ai.app;

import com.maxsolch.shop.ai.domain.AiFeature;
import com.maxsolch.shop.ai.domain.AiError;
import com.maxsolch.shop.ai.domain.ChatModel;
import com.maxsolch.shop.platform.error.DomainException;
import org.springframework.stereotype.Service;

import java.util.List;

/**
 * The AI settings screen in one answer: is the model key set, which search providers are on and resting, what this
 * month cost by provider and result — the counter of empty and failed searches lives here.
 */
@Service
public class AiStatusReport {

    public record AiStatus(boolean configured, String model, List<WebSearch.ProviderState> providers,
                           AiUsageLog.MonthSummary month) {
    }

    private final AiAgent agent;
    private final WebSearch search;
    private final AiUsageLog usage;
    private final ChatModel model;

    public AiStatusReport(AiAgent agent, WebSearch search, AiUsageLog usage,
                          ChatModel model) {
        this.agent = agent;
        this.search = search;
        this.usage = usage;
        this.model = model;
    }

    public AiStatus status() {
        return new AiStatus(agent.configured(), model.modelName(), search.providers(), usage.month());
    }

    /** One query through the chain, as the model would get it — to check the providers from the admin. */
    public WebSearch.Found testSearch(String query) {
        if (query == null || query.isBlank() || query.length() > 300) {
            throw new DomainException.BadRequest(AiError.BAD_REQUEST, "query");
        }
        return search.search(AiFeature.SEARCH_TEST, query.trim(), ResearchTools.HITS);
    }
}
