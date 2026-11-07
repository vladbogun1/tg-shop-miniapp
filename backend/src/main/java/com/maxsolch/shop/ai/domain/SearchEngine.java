package com.maxsolch.shop.ai.domain;

import java.util.List;

/**
 * One web search provider the AI researches through (its own tool «search»: the model chooses the query, our code
 * runs it — the built-in search of the model costs $0.01 per query, ours costs nothing or $0.001).
 *
 * <p>Two providers stand behind this port: the shop's SearXNG (free, but the engines it scrapes block it now and then)
 * and Serper (Google results by API, paid, the fallback). The chain that tries them in turn is
 * {@code ai.app.WebSearch}.
 */
public interface SearchEngine {

    /** Short name for the usage journal and the cooldown, e.g. {@code searxng}. */
    String name();

    /** Order in the chain: lower is asked first. */
    int order();

    /** False when the provider is not configured (no URL / no key): the chain skips it. */
    boolean enabled();

    /** What one search cost, micro-USD (0 for our own SearXNG). */
    long costMicroUsd();

    /**
     * Up to {@code limit} results. Never throws: a provider that is down or blocked answers {@link Outcome#failed}, an
     * honest «nothing found» answers {@link Outcome#found} with an empty list.
     */
    Outcome search(String query, int limit);

    record Hit(String title, String url, String snippet) {
    }

    /**
     * @param hits   results, possibly empty
     * @param failed the provider did not really search (HTTP error, timeout, every engine behind it blocked)
     * @param reason why it failed, for the journal; null when it did not
     */
    record Outcome(List<Hit> hits, boolean failed, String reason) {

        public static Outcome found(List<Hit> hits) {
            return new Outcome(List.copyOf(hits), false, null);
        }

        public static Outcome failure(String reason) {
            return new Outcome(List.of(), true, reason);
        }
    }
}
