package com.maxsolch.shop.ai.app;

import com.maxsolch.shop.ai.domain.AiScope;
import com.maxsolch.shop.ai.domain.AiUsage;
import com.maxsolch.shop.ai.domain.SearchEngine;
import com.maxsolch.shop.ai.domain.SearchEngine.Hit;
import com.maxsolch.shop.platform.cache.CacheConfig;
import org.springframework.cache.Cache;
import org.springframework.cache.CacheManager;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.time.Clock;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Set;

/**
 * Web search for the AI through a chain of providers (owner, 2026-11-07): our SearXNG first (free), Serper second
 * (Google by API, $0.001) — asked only when the one before failed or found nothing.
 *
 * <p>A provider that failed (HTTP error, timeout, SearXNG with every engine suspended) leaves the chain for 10 minutes
 * ({@link AiCaches#SEARCH_COOLDOWN}) instead of being asked and failing on every query of a 24-card run. Every query
 * of every provider is a line in {@code ai_usage}: OK, EMPTY or FAILED — the «empty searches» counter of a provider.
 * When the chain has nothing, the caller gets an empty list and tells the model so; the model must not guess URLs.
 */
@Service
public class WebSearch {

    /** Pages the AI must not use as a source: our own shop (circular) and social video (no spec tables). */
    static final Set<String> SKIPPED_HOSTS = Set.of("chisetup.com.ua", "instagram.com", "youtube.com",
            "facebook.com", "tiktok.com");

    /** {@code costMicroUsd} — what all providers asked for this query cost together. */
    public record Found(List<Hit> hits, String provider, long costMicroUsd) {

        public boolean empty() {
            return hits.isEmpty();
        }
    }

    private final List<SearchEngine> engines;
    private final AiUsageLog usage;
    private final Cache cooldown;
    private final Clock clock;

    public WebSearch(List<SearchEngine> engines, AiUsageLog usage, CacheManager caches, Clock clock) {
        this.engines = engines.stream().sorted(Comparator.comparingInt(SearchEngine::order)).toList();
        this.usage = usage;
        this.cooldown = CacheConfig.require(caches, AiCaches.SEARCH_COOLDOWN.name());
        this.clock = clock;
    }

    /**
     * The first non-empty answer of the chain. Resting providers are skipped — unless every configured one is
     * resting: then they are asked anyway (a single SearXNG with one bad minute must not leave the model blind for
     * ten). No provider configured at all is a FAILED line «none», so the empty-search counter sees it too.
     */
    public Found search(AiScope feature, String query, int limit) {
        long cost = 0;
        boolean asked = false;
        for (boolean resting : new boolean[]{false, true}) {
            for (SearchEngine engine : engines) {
                if (!engine.enabled() || (cooldown.get(engine.name()) != null) != resting) {
                    continue;
                }
                asked = true;
                Found found = ask(feature, engine, query, limit);
                cost += found.costMicroUsd();
                if (!found.empty()) {
                    return new Found(found.hits(), found.provider(), cost);
                }
            }
            if (asked) {
                return new Found(List.of(), null, cost);
            }
        }
        usage.call(feature, AiUsage.Kind.SEARCH, "none", AiUsage.Result.FAILED, 0, 0, "no search provider configured");
        return new Found(List.of(), null, 0);
    }

    private Found ask(AiScope feature, SearchEngine engine, String query, int limit) {
        long t0 = clock.millis();
        SearchEngine.Outcome out = engine.search(query, limit + SKIPPED_HOSTS.size());
        long ms = clock.millis() - t0;
        if (out.failed()) {
            cooldown.put(engine.name(), Boolean.TRUE);
            usage.call(feature, AiUsage.Kind.SEARCH, engine.name(), AiUsage.Result.FAILED, 0, ms, out.reason());
            return new Found(List.of(), engine.name(), 0);
        }
        List<Hit> hits = usable(out.hits(), limit);
        if (cooldown.get(engine.name()) != null && !hits.isEmpty()) {
            cooldown.evict(engine.name());
        }
        usage.call(feature, AiUsage.Kind.SEARCH, engine.name(),
                hits.isEmpty() ? AiUsage.Result.EMPTY : AiUsage.Result.OK, engine.costMicroUsd(), ms, null);
        return new Found(hits, engine.name(), engine.costMicroUsd());
    }

    /** Providers in chain order with whether each is configured and whether it is resting after a failure. */
    public record ProviderState(String name, boolean enabled, boolean coolingDown) {
    }

    public List<ProviderState> providers() {
        return engines.stream()
                .map(e -> new ProviderState(e.name(), e.enabled(), cooldown.get(e.name()) != null))
                .toList();
    }

    static List<Hit> usable(List<Hit> hits, int limit) {
        List<Hit> out = new ArrayList<>();
        for (Hit h : hits) {
            if (out.size() >= limit) {
                break;
            }
            if (!skipped(h.url())) {
                out.add(h);
            }
        }
        return out;
    }

    static boolean skipped(String url) {
        try {
            String host = URI.create(url).getHost();
            if (host == null) {
                return true;
            }
            String h = host.toLowerCase(java.util.Locale.ROOT);
            return SKIPPED_HOSTS.stream().anyMatch(s -> h.equals(s) || h.endsWith("." + s));
        } catch (IllegalArgumentException e) {
            return true;
        }
    }
}
