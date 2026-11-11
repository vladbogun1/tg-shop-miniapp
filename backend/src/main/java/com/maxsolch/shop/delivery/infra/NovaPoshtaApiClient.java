package com.maxsolch.shop.delivery.infra;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.maxsolch.shop.delivery.domain.NovaPoshtaException;
import com.maxsolch.shop.delivery.domain.NovaPoshtaGateway;
import com.maxsolch.shop.platform.http.HttpClientSettings;
import com.maxsolch.shop.platform.http.HttpClients;
import com.maxsolch.shop.platform.http.ResilientHttp;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * Nova Poshta JSON API 2.0 with our business key, over {@code platform.http}.
 *
 * <ul>
 *   <li>Reads ({@link #call}): POST by the API's design but harmless to repeat — retried by the platform client
 *       (2 extra attempts on an I/O error or 502/503/504).</li>
 *   <li>Checkout hints ({@link #callQuick}): one attempt, {@code quick-timeout-seconds} (5 s), and no waiting while NP
 *       is backing us off.</li>
 *   <li>Writes ({@link #write}): one attempt, never repeated; no answer = uncertain. Refused under {@code NP_DRY_RUN}
 *       here, so no app path can make a real waybill on the demo stand.</li>
 * </ul>
 * Every call passes one gate: a small gap after the previous call and, after NP answered «To many requests» (or
 * HTTP 429), a growing pause for everybody. The gate is plain fields on the clock without a lock: two calls slipping
 * through at once cost one extra request, which NP tolerates. The key never reaches a log.
 */
@Slf4j
@Component
public class NovaPoshtaApiClient implements NovaPoshtaGateway {

    static final String DEFAULT_URL = "https://api.novaposhta.ua/v2.0/json/";
    static final String DEFAULT_PRINT_URL = "https://my.novaposhta.ua";
    /** Only real waybill numbers go into the print URL. */
    static final Pattern TTN = Pattern.compile("^[0-9]{10,20}$");
    private static final Set<String> PRINT_KINDS = Set.of("printMarking100x100", "printMarking85x85", "printDocument");
    static final long MAX_PAUSE_MS = 60_000;

    private final DeliveryProperties props;
    private final ObjectMapper mapper;
    private final Clock clock;
    private final ResilientHttp http;
    private final ResilientHttp quick;
    private final ResilientHttp print;

    /** The gate: when the next call may go, until when NP asked us to back off, how many times in a row. */
    private long nextAt;
    private long pausedUntil;
    private int throttled;

    public NovaPoshtaApiClient(DeliveryProperties props, ObjectMapper mapper, Clock clock, HttpClients clients) {
        this.props = props;
        this.mapper = mapper;
        this.clock = clock;
        DeliveryProperties.NovaPoshta np = props.getNovaposhta();
        this.http = clients.create(HttpClientSettings.defaults("novaposhta-api")
                .withTimeouts(Duration.ofSeconds(10), Duration.ofSeconds(Math.max(5, np.getTimeoutSeconds())))
                .withRetries(2, Duration.ofMillis(400)));
        this.quick = clients.create(HttpClientSettings.defaults("novaposhta-quick")
                .withTimeouts(Duration.ofSeconds(3), Duration.ofSeconds(Math.max(1, np.getQuickTimeoutSeconds()))));
        this.print = clients.create(HttpClientSettings.defaults("novaposhta-print")
                .withTimeouts(Duration.ofSeconds(10), Duration.ofSeconds(60)));
    }

    @Override
    public boolean keyConfigured() {
        String k = props.getNovaposhta().getApiKey();
        return k != null && !k.isBlank();
    }

    @Override
    public boolean dryRun() {
        return props.getNovaposhta().isDryRun();
    }

    @Override
    public ObjectNode props() {
        return mapper.createObjectNode();
    }

    @Override
    public ArrayNode array() {
        return mapper.createArrayNode();
    }

    @Override
    public JsonNode call(String model, String method, JsonNode methodProperties) {
        return send(model, method, methodProperties, Mode.READ);
    }

    @Override
    public JsonNode callQuick(String model, String method, JsonNode methodProperties) {
        if (pausedMs() > 0) {
            throw NovaPoshtaException.unavailable("Новая почта просит подождать (To many requests)");
        }
        return send(model, method, methodProperties, Mode.QUICK);
    }

    @Override
    public JsonNode write(String model, String method, JsonNode methodProperties) {
        if (dryRun()) {
            throw NovaPoshtaException.rejected("NP_DRY_RUN: " + model + "." + method + " не отправлен в Новую почту");
        }
        return send(model, method, methodProperties, Mode.WRITE);
    }

    private enum Mode { READ, QUICK, WRITE }

    private JsonNode send(String model, String method, JsonNode methodProperties, Mode mode) {
        String key = requireKey();
        ObjectNode root = mapper.createObjectNode();
        root.put("apiKey", key);
        root.put("modelName", model);
        root.put("calledMethod", method);
        root.set("methodProperties", methodProperties == null ? mapper.createObjectNode() : methodProperties);
        String what = model + "." + method;
        JsonNode body;
        for (int round = 1; ; round++) {
            body = post(root, what, mode);
            if (body.path("success").asBoolean(false) || !throttledAnswer(body)) {
                break;
            }
            // «To many requests» is an answer, not a timeout: nothing was done, so even a write may repeat.
            backOff(what);
            if (round >= 2 || mode == Mode.QUICK) {
                throw NovaPoshtaException.unavailable("Новая почта: слишком много запросов, повторите через минуту");
            }
        }
        if (!body.path("success").asBoolean(false)) {
            throw NovaPoshtaException.rejected(firstError(body), codes(body));
        }
        throttled = 0;
        logWarnings(what, body);
        JsonNode data = body.get("data");
        return data == null || data.isNull() ? mapper.createArrayNode() : data;
    }

    private JsonNode post(ObjectNode root, String what, Mode mode) {
        String url = props.getNovaposhta().getApiUrl();
        awaitGate();
        try {
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(url == null || url.isBlank() ? DEFAULT_URL : url))
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(mapper.writeValueAsString(root), StandardCharsets.UTF_8))
                    .build();
            ResilientHttp client = mode == Mode.QUICK ? quick : http;
            HttpResponse<String> resp = client.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8),
                    mode == Mode.READ);
            if (resp.statusCode() == 429) {
                backOff(what);
                throw NovaPoshtaException.unavailable("Новая почта: слишком много запросов, повторите через минуту");
            }
            if (resp.statusCode() >= 500) {
                throw failed(mode, "Новая почта не ответила (" + what + "): HTTP " + resp.statusCode());
            }
            if (resp.statusCode() != 200) {
                throw NovaPoshtaException.rejected("Новая почта ответила HTTP " + resp.statusCode() + " на " + what);
            }
            return mapper.readTree(resp.body());
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw failed(mode, "Запрос к Новой почте прерван (" + what + ")");
        } catch (IOException e) {
            log.warn("Nova Poshta {} failed: {}", what, e.getClass().getSimpleName());
            throw failed(mode, "Новая почта не ответила (" + what + "): " + e.getClass().getSimpleName());
        }
    }

    /** No answer: a write may still have happened (uncertain); a read simply failed (unavailable). */
    private static NovaPoshtaException failed(Mode mode, String message) {
        return mode == Mode.WRITE ? NovaPoshtaException.uncertain(message) : NovaPoshtaException.unavailable(message);
    }

    /** NP's own «slow down» answer (HTTP 200, success:false). */
    static boolean throttledAnswer(JsonNode body) {
        String err = firstError(body).toLowerCase(Locale.ROOT);
        return err.contains("to many requests") || err.contains("too many requests");
    }

    /** Waits for the gate: the gap after the previous call and any pause NP asked for. */
    private void awaitGate() {
        long now = clock.millis();
        long at = Math.max(Math.max(nextAt, pausedUntil), now);
        nextAt = at + Math.max(0, props.getNovaposhta().getMinGapMs());
        long wait = at - now;
        if (wait > 0) {
            sleep(Math.min(wait, MAX_PAUSE_MS));
        }
    }

    /** Doubles the shared pause (1 s → 60 s) after a «To many requests». */
    private void backOff(String what) {
        throttled = Math.min(throttled + 1, 7);
        long pause = Math.min(MAX_PAUSE_MS, 500L << throttled);
        pausedUntil = clock.millis() + pause;
        log.warn("Nova Poshta asked to slow down on {} — pausing NP calls for {} ms", what, pause);
    }

    @Override
    public long pausedMs() {
        return Math.max(0, pausedUntil - clock.millis());
    }

    private static void logWarnings(String what, JsonNode body) {
        JsonNode w = body.get("warnings");
        if (w != null && ((w.isArray() && !w.isEmpty()) || (w.isObject() && !w.isEmpty()))) {
            String text = w.toString();
            log.warn("Nova Poshta {} warnings: {}", what, text.length() > 500 ? text.substring(0, 500) : text);
        }
    }

    @Override
    public byte[] printPdf(String kind, List<String> ttns) {
        String key = requireKey();
        if (ttns == null || ttns.isEmpty()) {
            throw NovaPoshtaException.rejected("Нет ТТН для печати");
        }
        if (ttns.stream().anyMatch(t -> t == null || !TTN.matcher(t).matches())) {
            throw NovaPoshtaException.rejected("Номер ТТН для печати — только цифры");
        }
        if (!PRINT_KINDS.contains(kind)) {
            throw NovaPoshtaException.rejected("Неизвестный формат печати");
        }
        String type = "printMarking85x85".equals(kind) ? "pdf8" : "pdf";
        String base = props.getNovaposhta().getPrintUrl();
        base = base == null || base.isBlank() ? DEFAULT_PRINT_URL : base;
        String url = base.replaceAll("/+$", "") + "/orders/" + kind + "/orders%5B%5D/" + String.join(",", ttns)
                + "/type/" + type + "/apiKey/" + key;
        awaitGate();
        try {
            HttpResponse<byte[]> resp = get(URI.create(url));
            int status = resp.statusCode();
            if (status >= 300 && status < 400) {
                // The cabinet host may send us on once; the platform client does not follow redirects itself.
                String location = resp.headers().firstValue("Location").orElse(null);
                if (location != null) {
                    resp = get(URI.create(url).resolve(location));
                }
            }
            byte[] body = resp.body();
            boolean pdf = body != null && body.length > 4 && body[0] == '%' && body[1] == 'P' && body[2] == 'D'
                    && body[3] == 'F';
            if (resp.statusCode() != 200 || !pdf) {
                throw NovaPoshtaException.rejected("Новая почта не отдала PDF для печати (HTTP " + resp.statusCode()
                        + "). Проверьте, что ТТН созданы этим кабинетом.");
            }
            return body;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw NovaPoshtaException.unavailable("Печать прервана");
        } catch (IOException | IllegalArgumentException e) {
            throw NovaPoshtaException.unavailable("Не удалось получить PDF у Новой почты: " + e.getClass().getSimpleName());
        }
    }

    private HttpResponse<byte[]> get(URI uri) throws IOException, InterruptedException {
        return print.send(HttpRequest.newBuilder().uri(uri).GET().build(), HttpResponse.BodyHandlers.ofByteArray());
    }

    private String requireKey() {
        String key = props.getNovaposhta().getApiKey();
        if (key == null || key.isBlank()) {
            throw NovaPoshtaException.rejected("Ключ API Новой почты не настроен (NOVAPOSHTA_API_KEY)");
        }
        return key;
    }

    static String firstError(JsonNode body) {
        for (String field : List.of("errors", "warnings")) {
            JsonNode n = body == null ? null : body.get(field);
            if (n != null && n.isArray() && !n.isEmpty()) {
                return "Новая почта: " + n.get(0).asText();
            }
            if (n != null && n.isObject() && !n.isEmpty()) {
                return "Новая почта: " + n.elements().next().asText();
            }
        }
        return "Новая почта вернула ошибку без описания";
    }

    private static List<String> codes(JsonNode body) {
        List<String> out = new ArrayList<>();
        JsonNode n = body.get("errorCodes");
        if (n != null && n.isArray()) {
            n.forEach(c -> out.add(c.asText()));
        }
        return out;
    }

    private static void sleep(long ms) {
        try {
            Thread.sleep(ms);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }
}
