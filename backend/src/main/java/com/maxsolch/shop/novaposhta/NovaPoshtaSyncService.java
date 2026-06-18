package com.maxsolch.shop.novaposhta;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.maxsolch.shop.config.AppProperties;
import com.maxsolch.shop.domain.NovaPoshtaCity;
import com.maxsolch.shop.domain.NovaPoshtaWarehouse;
import com.maxsolch.shop.repository.NovaPoshtaCityRepository;
import com.maxsolch.shop.repository.NovaPoshtaWarehouseRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Async;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Syncs the Nova Poshta warehouse directory into the local DB (and derives cities). Runs daily and
 * once on startup if the warehouse table is empty. Best-effort: never blocks/crashes the context.
 */
@Slf4j
@Service
public class NovaPoshtaSyncService {

    private static final int LIMIT = 500;
    private static final int MAX_PAGES = 200; // safety cap

    private final AppProperties props;
    private final NovaPoshtaCityRepository cityRepository;
    private final NovaPoshtaWarehouseRepository warehouseRepository;
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final HttpClient httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(15))
            .build();

    public NovaPoshtaSyncService(AppProperties props,
                                 NovaPoshtaCityRepository cityRepository,
                                 NovaPoshtaWarehouseRepository warehouseRepository) {
        this.props = props;
        this.cityRepository = cityRepository;
        this.warehouseRepository = warehouseRepository;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void onStartup() {
        try {
            if (warehouseRepository.count() == 0) {
                log.info("Nova Poshta warehouses table empty — scheduling initial sync.");
                syncAsync();
            }
        } catch (Exception e) {
            log.warn("Nova Poshta startup check failed: {}", e.getMessage());
        }
    }

    @Scheduled(cron = "${app.novaposhta.sync-cron:0 30 3 * * *}")
    public void scheduledSync() {
        syncAsync();
    }

    @Async
    public void syncAsync() {
        try {
            sync();
        } catch (Exception e) {
            log.warn("Nova Poshta sync failed: {}", e.getMessage());
        }
    }

    /**
     * Paginates getWarehouses and upserts warehouses + derived cities.
     */
    public void sync() throws Exception {
        String apiUrl = props.getNovaposhta().getApiUrl();
        if (apiUrl == null || apiUrl.isBlank()) {
            log.info("Nova Poshta apiUrl not configured — skipping sync.");
            return;
        }
        log.info("Starting Nova Poshta warehouse sync...");
        int page = 1;
        int total = 0;
        Map<String, NovaPoshtaCity> cities = new LinkedHashMap<>();

        while (page <= MAX_PAGES) {
            JsonNode data = fetchPage(apiUrl, page);
            if (data == null || !data.isArray() || data.isEmpty()) {
                break;
            }
            for (JsonNode w : data) {
                upsertWarehouse(w, cities);
                total++;
            }
            if (data.size() < LIMIT) {
                break;
            }
            page++;
        }

        if (!cities.isEmpty()) {
            cityRepository.saveAll(cities.values());
        }
        log.info("Nova Poshta sync done: {} warehouses, {} cities.", total, cities.size());
    }

    @Transactional
    protected void upsertWarehouse(JsonNode w, Map<String, NovaPoshtaCity> cities) {
        String ref = text(w, "Ref");
        if (ref == null || ref.isBlank()) {
            return;
        }
        String cityRef = text(w, "CityRef");
        String cityName = text(w, "CityDescription");

        NovaPoshtaWarehouse wh = warehouseRepository.findById(ref).orElseGet(() -> {
            NovaPoshtaWarehouse n = new NovaPoshtaWarehouse();
            n.setRef(ref);
            return n;
        });
        wh.setCityRef(cityRef == null ? "" : cityRef);
        wh.setCityName(cityName);
        wh.setNumber(text(w, "Number"));
        wh.setDescription(text(w, "Description"));
        wh.setType(text(w, "TypeOfWarehouse"));
        wh.setLat(parseDouble(text(w, "Latitude")));
        wh.setLng(parseDouble(text(w, "Longitude")));
        warehouseRepository.save(wh);

        if (cityRef != null && !cityRef.isBlank() && !cities.containsKey(cityRef)) {
            NovaPoshtaCity city = cityRepository.findById(cityRef).orElseGet(() -> {
                NovaPoshtaCity c = new NovaPoshtaCity();
                c.setRef(cityRef);
                return c;
            });
            city.setName(cityName == null ? cityRef : cityName);
            city.setArea(text(w, "SettlementAreaDescription"));
            cities.put(cityRef, city);
        }
    }

    private JsonNode fetchPage(String apiUrl, int page) throws Exception {
        ObjectNode root = objectMapper.createObjectNode();
        String apiKey = props.getNovaposhta().getApiKey();
        if (apiKey != null && !apiKey.isBlank()) {
            root.put("apiKey", apiKey);
        }
        root.put("modelName", "AddressGeneral");
        root.put("calledMethod", "getWarehouses");
        Map<String, String> mp = new HashMap<>();
        mp.put("Page", String.valueOf(page));
        mp.put("Limit", String.valueOf(LIMIT));
        root.set("methodProperties", objectMapper.valueToTree(mp));

        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(apiUrl))
                .timeout(Duration.ofSeconds(60))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(root)))
                .build();

        HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() != 200) {
            log.warn("Nova Poshta API returned status {}", response.statusCode());
            return null;
        }
        JsonNode body = objectMapper.readTree(response.body());
        return body.get("data");
    }

    private String text(JsonNode node, String field) {
        JsonNode v = node.get(field);
        return (v == null || v.isNull()) ? null : v.asText();
    }

    private Double parseDouble(String s) {
        if (s == null || s.isBlank()) {
            return null;
        }
        try {
            return Double.parseDouble(s);
        } catch (NumberFormatException e) {
            return null;
        }
    }
}
