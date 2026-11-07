package com.maxsolch.shop.ai.infra;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.maxsolch.shop.ai.domain.SearchEngine;
import com.maxsolch.shop.platform.http.HttpClientSettings;
import com.maxsolch.shop.platform.http.HttpClients;
import com.maxsolch.shop.platform.http.ResilientHttp;
import org.springframework.stereotype.Component;

import java.net.URI;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * serper.dev — Google results by API, $1 per 1000 queries (2500 free at sign-up). The paid fallback of the chain:
 * asked only when SearXNG failed or found nothing. 3 s to connect, 15 s for the answer, not repeated (every call is
 * billed).
 */
@Component
public class SerperSearch implements SearchEngine {

    private static final HttpClientSettings HTTP = HttpClientSettings.defaults("ai-serper")
            .withTimeouts(Duration.ofSeconds(3), Duration.ofSeconds(15));

    private final ResilientHttp http;
    private final ObjectMapper mapper;
    private final AiProperties.Search props;

    public SerperSearch(AiProperties props, ObjectMapper mapper, HttpClients clients) {
        this.http = clients.create(HTTP);
        this.mapper = mapper;
        this.props = props.getSearch();
    }

    @Override
    public String name() {
        return "serper";
    }

    @Override
    public int order() {
        return 20;
    }

    @Override
    public boolean enabled() {
        return props.getSerperKey() != null && !props.getSerperKey().isBlank();
    }

    @Override
    public long costMicroUsd() {
        return props.getSerperCostMicroUsd();
    }

    @Override
    public Outcome search(String query, int limit) {
        try {
            String body = mapper.writeValueAsString(Map.of("q", query, "num", Math.max(1, Math.min(limit, 10))));
            HttpResponse<String> res = http.send(HttpRequest.newBuilder(URI.create(props.getSerperUrl()))
                            .header("X-API-KEY", props.getSerperKey().trim())
                            .header("Content-Type", "application/json")
                            .POST(HttpRequest.BodyPublishers.ofString(body, StandardCharsets.UTF_8)).build(),
                    HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8), false);
            if (res.statusCode() != 200) {
                return Outcome.failure("HTTP " + res.statusCode());
            }
            return Outcome.found(parse(mapper.readTree(res.body()), limit));
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return Outcome.failure("interrupted");
        } catch (Exception e) {
            return Outcome.failure(e.getClass().getSimpleName());
        }
    }

    static List<Hit> parse(JsonNode root, int limit) {
        List<Hit> hits = new ArrayList<>();
        for (JsonNode r : root.path("organic")) {
            if (hits.size() >= limit) {
                break;
            }
            String url = r.path("link").asText("");
            if (!url.isEmpty()) {
                hits.add(new Hit(r.path("title").asText(""), url, r.path("snippet").asText("")));
            }
        }
        return hits;
    }
}
