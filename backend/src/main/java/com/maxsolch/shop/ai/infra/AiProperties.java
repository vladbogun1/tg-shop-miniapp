package com.maxsolch.shop.ai.infra;

import jakarta.validation.constraints.Min;
import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

/**
 * {@code app.ai.*}: the model (MiniMax, Anthropic-compatible API), the search chain (SearXNG first, Serper as the
 * paid fallback) and the monthly spend limit. An empty key switches its part off: no model key = the AI buttons
 * answer «ИИ не настроен»; no SearXNG URL and no Serper key = research without search.
 */
@Getter
@Setter
@Validated
@ConfigurationProperties(prefix = "app.ai")
public class AiProperties {

    private Model model = new Model();
    private Search search = new Search();
    /** Spend limit per calendar month (shop time zone), USD cents; 0 = no limit. */
    @Min(0)
    private long monthLimitCents = 1000;
    /** Whether this instance takes AI jobs from the queue (off in integration tests, which drive the queue by hand). */
    private boolean workerEnabled = true;

    @Getter
    @Setter
    public static class Model {
        private String apiKey = "";
        private String baseUrl = "https://api.minimax.io/anthropic";
        private String name = "MiniMax-M3.1-Flash";
        /** Prices per million tokens, micro-USD. */
        private long inputPerM = 150_000;
        private long cachedPerM = 15_000;
        private long outputPerM = 600_000;
    }

    @Getter
    @Setter
    public static class Search {
        /** Our SearXNG with the JSON format on; blank = off. */
        private String searxngUrl = "";
        /** serper.dev key; blank = no paid fallback. */
        private String serperKey = "";
        private String serperUrl = "https://google.serper.dev/search";
        /** What one Serper query costs, micro-USD ($1 per 1000 on the smallest pack). */
        private long serperCostMicroUsd = 1000;
    }
}
