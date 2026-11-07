package com.maxsolch.shop.ai.infra;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.maxsolch.shop.ai.domain.SearchEngine;
import com.maxsolch.shop.platform.http.HttpClientSettings;
import com.maxsolch.shop.platform.http.HttpClients;
import com.maxsolch.shop.platform.http.ResilientHttp;
import org.springframework.stereotype.Component;

import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;

/**
 * Our SearXNG (metasearch: Yahoo, Yandex, Mojeek, Google… whichever answers from our server's address). Free, but the
 * engines behind it suspend us after bursts ("too many requests"): then SearXNG answers 200 with no results and a list
 * of {@code unresponsive_engines} — that is a failure of the provider, not an honest «nothing found».
 * 3 s to connect, 20 s for the answer (it waits for the slowest engine), no retry: the chain has a fallback.
 */
@Component
public class SearxngSearch implements SearchEngine {

    private static final HttpClientSettings HTTP = HttpClientSettings.defaults("ai-searxng")
            .withTimeouts(Duration.ofSeconds(3), Duration.ofSeconds(20))
            .withHttp11();

    private final ResilientHttp http;
    private final ObjectMapper mapper;
    private final String base;

    public SearxngSearch(AiProperties props, ObjectMapper mapper, HttpClients clients) {
        this.http = clients.create(HTTP);
        this.mapper = mapper;
        String url = props.getSearch().getSearxngUrl();
        this.base = url == null ? "" : url.trim().replaceAll("/+$", "");
    }

    @Override
    public String name() {
        return "searxng";
    }

    @Override
    public int order() {
        return 10;
    }

    @Override
    public boolean enabled() {
        return !base.isEmpty();
    }

    @Override
    public long costMicroUsd() {
        return 0;
    }

    @Override
    public Outcome search(String query, int limit) {
        try {
            URI uri = URI.create(base + "/search?format=json&q=" + URLEncoder.encode(query, StandardCharsets.UTF_8));
            HttpResponse<String> res = http.send(HttpRequest.newBuilder(uri).GET().build(),
                    HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
            if (res.statusCode() != 200) {
                return Outcome.failure("HTTP " + res.statusCode());
            }
            return parse(mapper.readTree(res.body()), limit);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return Outcome.failure("interrupted");
        } catch (Exception e) {
            return Outcome.failure(e.getClass().getSimpleName());
        }
    }

    static Outcome parse(JsonNode root, int limit) {
        List<Hit> hits = new ArrayList<>();
        for (JsonNode r : root.path("results")) {
            if (hits.size() >= limit) {
                break;
            }
            String url = r.path("url").asText("");
            if (!url.isEmpty()) {
                hits.add(new Hit(r.path("title").asText(""), url, r.path("content").asText("")));
            }
        }
        JsonNode down = root.path("unresponsive_engines");
        if (hits.isEmpty() && down.isArray() && !down.isEmpty()) {
            return Outcome.failure("engines down: " + down.toString());
        }
        return Outcome.found(hits);
    }
}
