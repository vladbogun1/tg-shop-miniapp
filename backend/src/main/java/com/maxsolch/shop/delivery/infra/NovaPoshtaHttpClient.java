package com.maxsolch.shop.delivery.infra;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.maxsolch.shop.delivery.domain.NovaPoshtaApi;
import com.maxsolch.shop.platform.http.HttpClientSettings;
import com.maxsolch.shop.platform.http.HttpClients;
import com.maxsolch.shop.platform.http.ResilientHttp;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Nova Poshta JSON API over {@code platform.http}: 15 s to connect and 60 s per request (as before), and up to two
 * repeats with a 2 s pause. The directory request is a POST by the API's design but only reads, so repeating it is
 * safe ({@code retryable = true}); a 502/503/504 or an I/O error no longer spoils a nightly run on the first hiccup.
 * {@code app.http.clients.novaposhta.*} overrides all of it.
 */
@Slf4j
@Component
public class NovaPoshtaHttpClient implements NovaPoshtaApi {

    static final String CLIENT_NAME = "novaposhta";

    private final DeliveryProperties props;
    private final ObjectMapper mapper;
    private final ResilientHttp http;

    public NovaPoshtaHttpClient(DeliveryProperties props, ObjectMapper mapper, HttpClients clients) {
        this.props = props;
        this.mapper = mapper;
        this.http = clients.create(HttpClientSettings.defaults(CLIENT_NAME)
                .withTimeouts(Duration.ofSeconds(15), Duration.ofSeconds(60))
                .withRetries(2, Duration.ofSeconds(2)));
    }

    @Override
    public boolean isConfigured() {
        String apiUrl = props.getNovaposhta().getApiUrl();
        return apiUrl != null && !apiUrl.isBlank();
    }

    @Override
    public List<ApiWarehouse> warehousesPage(int page, int limit) throws IOException, InterruptedException {
        Map<String, String> mp = new HashMap<>();
        mp.put("Page", String.valueOf(page));
        mp.put("Limit", String.valueOf(limit));
        JsonNode data = post("AddressGeneral", "getWarehouses", mp);
        if (data == null || !data.isArray()) {
            throw new NovaPoshtaApi.ApiException("API Новой Почты вернул ответ без списка отделений");
        }
        List<ApiWarehouse> out = new ArrayList<>(data.size());
        for (JsonNode w : data) {
            JsonNode dims = w.get("ReceivingLimitationsOnDimensions");
            Double maxKg = parseDouble(text(w, "PlaceMaxWeightAllowed"));
            out.add(new ApiWarehouse(text(w, "Ref"), text(w, "CityRef"), text(w, "CityDescription"),
                    text(w, "Number"), text(w, "Description"), text(w, "TypeOfWarehouse"),
                    text(w, "Latitude"), text(w, "Longitude"), text(w, "SettlementAreaDescription"),
                    text(w, "CategoryOfWarehouse"), text(w, "WarehouseStatus"),
                    cmToMm(dims, "Length"), cmToMm(dims, "Width"), cmToMm(dims, "Height"),
                    maxKg == null || maxKg <= 0 ? null : (int) Math.round(maxKg)));
        }
        return out;
    }

    @Override
    public Map<String, String> warehouseTypes() throws IOException, InterruptedException {
        JsonNode data = post("Address", "getWarehouseTypes", Map.of());
        Map<String, String> out = new LinkedHashMap<>();
        if (data != null && data.isArray()) {
            for (JsonNode t : data) {
                String ref = text(t, "Ref");
                if (ref != null && !ref.isBlank()) {
                    String name = text(t, "Description");
                    out.put(ref, name == null ? "" : name);
                }
            }
        }
        return out;
    }

    /** One directory read: {@code data} of a 200 + success answer; anything else is an {@link ApiException}. */
    private JsonNode post(String model, String method, Map<String, String> mp) throws IOException, InterruptedException {
        ObjectNode root = mapper.createObjectNode();
        String apiKey = props.getNovaposhta().getApiKey();
        if (apiKey != null && !apiKey.isBlank()) {
            root.put("apiKey", apiKey);
        }
        root.put("modelName", model);
        root.put("calledMethod", method);
        root.set("methodProperties", mapper.valueToTree(mp));

        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(props.getNovaposhta().getApiUrl()))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(mapper.writeValueAsString(root)))
                .build();

        HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString(), true);
        if (response.statusCode() != 200) {
            throw new NovaPoshtaApi.ApiException("API Новой Почты ответил HTTP " + response.statusCode());
        }
        JsonNode body = mapper.readTree(response.body());
        if (body == null || !body.path("success").asBoolean(true)) {
            throw new NovaPoshtaApi.ApiException("API Новой Почты: success=false" + errorsOf(body));
        }
        return body.get("data");
    }

    private static Integer cmToMm(JsonNode dims, String field) {
        if (dims == null || !dims.isObject()) {
            return null;
        }
        double cm = dims.path(field).asDouble(0);
        return cm > 0 ? (int) Math.round(cm * 10) : null;
    }

    private static Double parseDouble(String s) {
        if (s == null || s.isBlank()) {
            return null;
        }
        try {
            return Double.parseDouble(s);
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private static String errorsOf(JsonNode body) {
        JsonNode errors = body == null ? null : body.get("errors");
        if (errors == null || !errors.isArray() || errors.isEmpty()) {
            return "";
        }
        StringBuilder sb = new StringBuilder();
        errors.forEach(e -> sb.append(sb.length() == 0 ? "" : "; ").append(e.asText()));
        return ": " + (sb.length() > 300 ? sb.substring(0, 300) : sb);
    }

    private static String text(JsonNode node, String field) {
        JsonNode v = node.get(field);
        return (v == null || v.isNull()) ? null : v.asText();
    }
}
