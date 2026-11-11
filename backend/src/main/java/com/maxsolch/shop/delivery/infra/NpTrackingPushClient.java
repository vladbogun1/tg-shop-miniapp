package com.maxsolch.shop.delivery.infra;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.maxsolch.shop.delivery.domain.NovaPoshtaException;
import com.maxsolch.shop.delivery.domain.NpTrackingPush;
import com.maxsolch.shop.platform.http.HttpClientSettings;
import com.maxsolch.shop.platform.http.HttpClients;
import com.maxsolch.shop.platform.http.ResilientHttp;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

/**
 * Webhook subscriptions of the new Nova Poshta REST ({@code /tracking-push/subscribers}), signed in with a JWT
 * issued for the same UA business key ({@code GET /clients/authorization?apiKey=}, one hour; kept 55 minutes,
 * re-issued once on 401). Only what the admin needs: list, create a {@code legal} subscription (every waybill whose
 * sender has the shop's tax id), delete our own. Writes: one attempt, refused under {@code NP_DRY_RUN}. The token
 * is a plain field: two admins asking at once cost one extra authorisation call.
 */
@Component
public class NpTrackingPushClient implements NpTrackingPush {

    private static final Duration JWT_TTL = Duration.ofMinutes(55);
    static final String DEFAULT_REST_URL = "https://api.novaposhta.ua/v.1.0";

    private final DeliveryProperties props;
    private final ObjectMapper mapper;
    private final Clock clock;
    private final ResilientHttp http;
    private String jwt;
    private Instant jwtUntil = Instant.EPOCH;

    public NpTrackingPushClient(DeliveryProperties props, ObjectMapper mapper, Clock clock, HttpClients clients) {
        this.props = props;
        this.mapper = mapper;
        this.clock = clock;
        this.http = clients.create(HttpClientSettings.defaults("novaposhta-rest")
                .withTimeouts(Duration.ofSeconds(10), Duration.ofSeconds(20)));
    }

    @Override
    public List<Subscription> list() {
        JsonNode body = send("GET", "/tracking-push/subscribers", null);
        JsonNode items = body.has("items") ? body.get("items") : body.has("data") ? body.get("data") : body;
        List<Subscription> out = new ArrayList<>();
        if (items != null && items.isArray()) {
            for (JsonNode n : items) {
                out.add(subscription(n));
            }
        }
        return out;
    }

    @Override
    public Subscription createLegal(String url, String secret, List<String> companyTins) {
        requireWritable();
        ObjectNode b = mapper.createObjectNode();
        b.put("type", "legal");
        b.put("url", url);
        b.put("isActive", true);
        b.put("contentType", "application/json");
        b.putArray("eventTypes");
        b.put("secretToken", secret);
        b.put("secretTokenHeaderName", "X-NP-Key");
        b.put("sendWarnings", false);
        companyTins.forEach(b.putArray("companyTins")::add);
        return subscription(send("POST", "/tracking-push/subscribers", b));
    }

    @Override
    public void delete(String id) {
        requireWritable();
        send("DELETE", "/tracking-push/subscribers/" + URLEncoder.encode(id, StandardCharsets.UTF_8), null);
    }

    /** NP_DRY_RUN covers every write: a stand never subscribes NP to itself. */
    private void requireWritable() {
        if (props.getNovaposhta().isDryRun()) {
            throw NovaPoshtaException.rejected("Режим проверки (NP_DRY_RUN): подписки Новой почты не меняются");
        }
    }

    private static Subscription subscription(JsonNode n) {
        List<String> tins = new ArrayList<>();
        JsonNode t = n.has("companyTins") ? n.get("companyTins") : n.get("company_tins");
        if (t != null && t.isArray()) {
            t.forEach(x -> tins.add(x.asText()));
        }
        JsonNode active = n.has("isActive") ? n.get("isActive") : n.get("is_active");
        return new Subscription(text(n, "id"), text(n, "type"), text(n, "url"), active != null && active.asBoolean(),
                tins);
    }

    private JsonNode send(String method, String path, JsonNode body) {
        HttpResponse<String> r = exchange(method, path, body, token(false));
        if (r.statusCode() == 401) {
            r = exchange(method, path, body, token(true));
        }
        return read(r, method + " " + path);
    }

    private String token(boolean fresh) {
        if (!fresh && jwt != null && clock.instant().isBefore(jwtUntil)) {
            return jwt;
        }
        String key = props.getNovaposhta().getApiKey();
        if (key == null || key.isBlank()) {
            throw NovaPoshtaException.rejected("Ключ API Новой почты не настроен (NOVAPOSHTA_API_KEY)");
        }
        HttpRequest req = HttpRequest.newBuilder(URI.create(base() + "/clients/authorization?apiKey="
                        + URLEncoder.encode(key.trim(), StandardCharsets.UTF_8)))
                .GET().build();
        JsonNode body = read(call(req, true), "authorization");
        String t = text(body, "jwt");
        if (t == null || t.isBlank()) {
            throw NovaPoshtaException.rejected("Новая почта не выдала токен для REST API");
        }
        jwt = t;
        jwtUntil = clock.instant().plus(JWT_TTL);
        return jwt;
    }

    private HttpResponse<String> exchange(String method, String path, JsonNode body, String token) {
        HttpRequest.BodyPublisher pub = body == null ? HttpRequest.BodyPublishers.noBody()
                : HttpRequest.BodyPublishers.ofString(body.toString(), StandardCharsets.UTF_8);
        HttpRequest req = HttpRequest.newBuilder(URI.create(base() + path))
                .header("Authorization", token)
                .header("Content-Type", "application/json")
                .header("Accept", "application/json")
                .method(method, pub)
                .build();
        return call(req, "GET".equals(method));
    }

    private HttpResponse<String> call(HttpRequest req, boolean retryable) {
        try {
            return http.send(req, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8), retryable);
        } catch (IOException e) {
            throw NovaPoshtaException.unavailable("Новая почта (REST) не ответила: " + e.getClass().getSimpleName());
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw NovaPoshtaException.unavailable("Запрос к Новой почте прерван");
        }
    }

    /** 2xx → the parsed body; otherwise the first error message NP gave (the key is never in it). */
    private JsonNode read(HttpResponse<String> r, String what) {
        JsonNode body;
        try {
            body = r.body() == null || r.body().isBlank() ? mapper.createObjectNode() : mapper.readTree(r.body());
        } catch (IOException e) {
            body = mapper.createObjectNode();
        }
        if (r.statusCode() / 100 != 2) {
            String msg = firstError(body.path("errors"));
            String where = what.startsWith("authorization") ? "authorization" : what;
            throw NovaPoshtaException.rejected("Новая почта (REST " + where + ", HTTP " + r.statusCode() + "): "
                    + (msg == null ? "ошибка" : msg));
        }
        return body;
    }

    static String firstError(JsonNode errors) {
        if (errors == null || errors.isMissingNode() || errors.isNull()) {
            return null;
        }
        if (errors.isTextual()) {
            return errors.asText();
        }
        for (JsonNode v : errors) {
            String s = v.isContainerNode() ? firstError(v) : v.asText();
            if (s != null && !s.isBlank()) {
                return s;
            }
        }
        return null;
    }

    private static String text(JsonNode n, String f) {
        JsonNode v = n == null ? null : n.get(f);
        return v == null || v.isNull() ? null : v.asText();
    }

    private String base() {
        String u = props.getNovaposhta().getRestUrl();
        u = u == null || u.isBlank() ? DEFAULT_REST_URL : u.trim();
        return u.endsWith("/") ? u.substring(0, u.length() - 1) : u;
    }
}
