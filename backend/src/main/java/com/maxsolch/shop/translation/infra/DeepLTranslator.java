package com.maxsolch.shop.translation.infra;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.maxsolch.shop.platform.http.HttpClientSettings;
import com.maxsolch.shop.platform.http.HttpClients;
import com.maxsolch.shop.platform.http.ResilientHttp;
import com.maxsolch.shop.translation.domain.MachineTranslationException;
import com.maxsolch.shop.translation.domain.MachineTranslationException.Kind;
import com.maxsolch.shop.translation.domain.MachineTranslator;
import com.maxsolch.shop.translation.domain.TranslationGlossary;
import lombok.extern.slf4j.Slf4j;
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
import java.util.concurrent.atomic.AtomicReference;

/**
 * DeepL API v2: {@code GET /v2/usage} and {@code POST /v2/translate}.
 *
 * <p>5 s to connect, 60 s for the answer. A translation changes nothing anywhere, a repeat only spends the same
 * characters once more, so an I/O error or 502–504 is repeated once ({@link ResilientHttp}). 456 = the monthly
 * characters are spent, 403 = bad key, 429/5xx = try on the next run.
 *
 * <p>Texts go as plain text: DeepL keeps {@code {name}} placeholders as they are, while its XML mode moved the text
 * around ignored tags onto new lines (checked 10.11.2026); a mangled placeholder is caught by the answer check.
 * Terms go in the shop's glossary ({@link DeepLGlossary}): found or created on first use, then kept by id; without it
 * (refused, not found) the text is still translated, the glossary is looked up again on the next call.
 */
@Slf4j
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
    private final AtomicReference<String> glossaryId = new AtomicReference<>();

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
        JsonNode body = call(req, "usage", true);
        return new Usage(body.path("character_count").asLong(0), body.path("character_limit").asLong(0));
    }

    @Override
    public List<String> translate(List<String> texts, String locale, String context)
            throws MachineTranslationException {
        if (texts.isEmpty()) {
            return List.of();
        }
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("text", texts);
        payload.put("source_lang", "RU");
        payload.put("target_lang", target(locale));
        payload.put("preserve_formatting", true);
        payload.put("split_sentences", "1");
        if (context != null && !context.isBlank()) {
            payload.put("context", context);
        }
        String glossary = glossaryFor(locale);
        if (glossary != null) {
            payload.put("glossary_id", glossary);
        }
        JsonNode body;
        try {
            body = call(post("/v2/translate", payload), "translate", true);
        } catch (MachineTranslationException e) {
            glossaryId.set(null);
            throw e;
        }
        JsonNode list = body.path("translations");
        if (!list.isArray() || list.size() != texts.size()) {
            throw new MachineTranslationException(Kind.BAD_ANSWER,
                    "deepl answered " + list.size() + " translations for " + texts.size() + " texts");
        }
        List<String> out = new ArrayList<>(texts.size());
        for (int i = 0; i < texts.size(); i++) {
            String text = list.get(i).path("text").asText("");
            out.add("en".equals(locale) ? DeepLGlossary.ungroupNumbers(texts.get(i), text) : text);
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

    /** The shop's glossary id when it has terms for this language; null = translate without it. */
    private String glossaryFor(String locale) throws MachineTranslationException {
        Map<String, String> dicts = DeepLGlossary.dictionaries(TranslationGlossary.TERMS);
        if (!dicts.containsKey(locale)) {
            return null;
        }
        String cached = glossaryId.get();
        if (cached != null) {
            return cached;
        }
        try {
            String id = findOrCreateGlossary(dicts);
            glossaryId.set(id);
            return id;
        } catch (MachineTranslationException e) {
            if (e.kind() == Kind.AUTH || e.kind() == Kind.QUOTA) {
                throw e;
            }
            log.warn("deepl glossary unavailable, translating without it: {}", e.getMessage());
            return null;
        }
    }

    private String findOrCreateGlossary(Map<String, String> dicts) throws MachineTranslationException {
        String name = DeepLGlossary.name(dicts);
        String found = null;
        for (JsonNode g : call(base("/v3/glossaries").GET().build(), "glossaries", true).path("glossaries")) {
            String id = g.path("glossary_id").asText("");
            String gName = g.path("name").asText("");
            if (found == null && gName.equals(name)) {
                found = id;
            } else if (gName.startsWith(DeepLGlossary.PREFIX)) {
                call(base("/v3/glossaries/" + id).DELETE().build(), "glossary delete", true);
            }
        }
        if (found != null) {
            return found;
        }
        String id = call(post("/v3/glossaries", DeepLGlossary.createBody(name, dicts)), "glossary create", false)
                .path("glossary_id").asText("");
        if (id.isEmpty()) {
            throw new MachineTranslationException(Kind.BAD_ANSWER, "deepl created a glossary without id");
        }
        log.info("deepl glossary {} created", name);
        return id;
    }

    private HttpRequest post(String path, Object payload) throws MachineTranslationException {
        return base(path)
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(json(payload), StandardCharsets.UTF_8))
                .build();
    }

    private HttpRequest.Builder base(String path) {
        return HttpRequest.newBuilder(URI.create(props.effectiveBaseUrl() + path))
                .header("Authorization", "DeepL-Auth-Key " + props.getApiKey().trim())
                .header("Accept", "application/json");
    }

    private JsonNode call(HttpRequest req, String what, boolean idempotent) throws MachineTranslationException {
        HttpResponse<String> res;
        try {
            res = http.send(req, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8), idempotent);
        } catch (IOException e) {
            throw new MachineTranslationException(Kind.TEMPORARY, "deepl unreachable: " + e.getClass().getSimpleName(), e);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new MachineTranslationException(Kind.TEMPORARY, "interrupted", e);
        }
        int code = res.statusCode();
        if (code / 100 == 2) {
            try {
                return res.body() == null || res.body().isBlank() ? mapper.missingNode() : mapper.readTree(res.body());
            } catch (IOException e) {
                throw new MachineTranslationException(Kind.BAD_ANSWER, "deepl answer is not json", e);
            }
        }
        throw new MachineTranslationException(kindOf(code), "deepl " + what + " answered " + code);
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
