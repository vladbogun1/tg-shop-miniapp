package com.maxsolch.shop.translation.infra;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.maxsolch.shop.platform.http.HttpClientSettings;
import com.maxsolch.shop.platform.http.HttpClients;
import com.maxsolch.shop.platform.http.ResilientHttp;
import com.maxsolch.shop.translation.domain.MachineTranslationException;
import com.maxsolch.shop.translation.domain.MachineTranslationException.Kind;
import com.maxsolch.shop.translation.domain.MachineTranslator;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * DeepL API v2: {@code GET /v2/usage} and {@code POST /v2/translate}.
 *
 * <p>5 s to connect, 60 s for the answer. A translation changes nothing anywhere, a repeat only spends the same
 * characters once more, so an I/O error or 502–504 is repeated once ({@link ResilientHttp}). 456 = the monthly
 * characters are spent, 403 = bad key, 429/5xx = try on the next run.
 *
 * <p>Placeholders like {@code {name}} must come back untouched: such texts go in XML mode with the placeholder inside
 * an ignored {@code <x>} tag; sentences are still split on new lines so the lines of the source stay lines.
 */
@Component
public class DeepLTranslator implements MachineTranslator {

    private static final HttpClientSettings HTTP = HttpClientSettings.defaults("deepl")
            .withTimeouts(Duration.ofSeconds(5), Duration.ofSeconds(60))
            .withRetries(1, Duration.ofSeconds(2));
    /** DeepL takes up to 50 texts and 128 KiB per request; Cyrillic is 2 bytes in UTF-8, plus JSON. */
    private static final int MAX_TEXTS = 50;
    private static final int MAX_CHARS = 30_000;

    private final ResilientHttp http;
    private final ObjectMapper mapper;
    private final DeepLProperties props;

    public DeepLTranslator(DeepLProperties props, ObjectMapper mapper, HttpClients clients) {
        this.http = clients.create(HTTP);
        this.mapper = mapper;
        this.props = props;
    }

    @Override
    public boolean configured() {
        return props.getApiKey() != null && !props.getApiKey().isBlank();
    }

    @Override
    public int maxTextsPerCall() {
        return MAX_TEXTS;
    }

    @Override
    public int maxCharsPerCall() {
        return MAX_CHARS;
    }

    @Override
    public Usage usage() throws MachineTranslationException {
        HttpRequest req = base("/v2/usage").GET().build();
        JsonNode body = call(req, false);
        return new Usage(body.path("character_count").asLong(0), body.path("character_limit").asLong(0));
    }

    @Override
    public List<String> translate(List<String> texts, String locale, String context)
            throws MachineTranslationException {
        if (texts.isEmpty()) {
            return List.of();
        }
        boolean xml = texts.stream().anyMatch(DeepLMarkup::needsXml);
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("text", xml ? texts.stream().map(DeepLMarkup::toXml).toList() : texts);
        payload.put("source_lang", "RU");
        payload.put("target_lang", target(locale));
        payload.put("preserve_formatting", true);
        payload.put("split_sentences", "1");
        if (context != null && !context.isBlank()) {
            payload.put("context", context);
        }
        if (xml) {
            payload.put("tag_handling", "xml");
            payload.put("ignore_tags", List.of(DeepLMarkup.TAG));
        }
        JsonNode body = call(base("/v2/translate")
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(json(payload), StandardCharsets.UTF_8))
                .build(), true);
        JsonNode list = body.path("translations");
        if (!list.isArray() || list.size() != texts.size()) {
            throw new MachineTranslationException(Kind.BAD_ANSWER,
                    "deepl answered " + list.size() + " translations for " + texts.size() + " texts");
        }
        List<String> out = new ArrayList<>(texts.size());
        for (JsonNode t : list) {
            String text = t.path("text").asText("");
            out.add(xml ? DeepLMarkup.fromXml(text) : text);
        }
        return out;
    }

    static String target(String locale) {
        return switch (locale) {
            case "uk" -> "UK";
            case "en" -> "EN-US";
            default -> throw new IllegalArgumentException("locale " + locale);
        };
    }

    private HttpRequest.Builder base(String path) {
        return HttpRequest.newBuilder(URI.create(props.effectiveBaseUrl() + path))
                .header("Authorization", "DeepL-Auth-Key " + props.getApiKey().trim())
                .header("Accept", "application/json");
    }

    private JsonNode call(HttpRequest req, boolean post) throws MachineTranslationException {
        HttpResponse<String> res;
        try {
            res = http.send(req, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8), true);
        } catch (IOException e) {
            throw new MachineTranslationException(Kind.TEMPORARY, "deepl unreachable: " + e.getClass().getSimpleName(), e);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new MachineTranslationException(Kind.TEMPORARY, "interrupted", e);
        }
        int code = res.statusCode();
        if (code / 100 == 2) {
            try {
                return mapper.readTree(res.body());
            } catch (IOException e) {
                throw new MachineTranslationException(Kind.BAD_ANSWER, "deepl answer is not json", e);
            }
        }
        throw new MachineTranslationException(kindOf(code), "deepl " + (post ? "translate" : "usage") + " answered " + code);
    }

    static Kind kindOf(int status) {
        if (status == 456) {
            return Kind.QUOTA;
        }
        if (status == 401 || status == 403) {
            return Kind.AUTH;
        }
        if (status == 429 || status >= 500) {
            return Kind.TEMPORARY;
        }
        return Kind.BAD_ANSWER;
    }

    private String json(Object payload) throws MachineTranslationException {
        try {
            return mapper.writeValueAsString(payload);
        } catch (IOException e) {
            throw new MachineTranslationException(Kind.BAD_ANSWER, "cannot write request", e);
        }
    }
}
