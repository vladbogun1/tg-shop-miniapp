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
import org.springframework.core.task.TaskExecutor;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Syncs the Nova Poshta warehouse directory into the local DB (and derives cities). Runs daily and
 * once on startup if the warehouse table is empty. Best-effort: never blocks or crashes the context.
 *
 * <p>Background work is handed to an injected {@link TaskExecutor} rather than annotating a method
 * with {@code @Async} and calling it from inside this same bean: a self-invocation bypasses the
 * Spring proxy, so the "async" startup sync actually ran inline on the ApplicationReadyEvent
 * thread and stalled boot for as long as ~35k warehouses took to fetch and insert. For the same
 * reason the per-page transaction is opened by an injected helper bean instead of a
 * {@code @Transactional} method called from within this class.
 */
@Slf4j
@Service
public class NovaPoshtaSyncService {

    private static final int LIMIT = 500;
    private static final int MAX_PAGES = 200; // safety cap

    private final AppProperties props;
    private final NovaPoshtaWarehouseRepository warehouseRepository;
    private final NovaPoshtaUpsertService upsertService;
    private final TaskExecutor taskExecutor;
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final HttpClient httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(15))
            .build();
    /** Guards against a scheduled run starting while the previous one is still going. */
    private final AtomicBoolean running = new AtomicBoolean(false);

    public NovaPoshtaSyncService(AppProperties props,
                                 NovaPoshtaWarehouseRepository warehouseRepository,
                                 NovaPoshtaUpsertService upsertService,
                                 TaskExecutor taskExecutor) {
        this.props = props;
        this.warehouseRepository = warehouseRepository;
        this.upsertService = upsertService;
        this.taskExecutor = taskExecutor;
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

    /** Runs the sync on a background thread. Safe to call from anywhere, including this bean. */
    public void syncAsync() {
        taskExecutor.execute(() -> {
            try {
                sync();
            } catch (Exception e) {
                log.warn("Nova Poshta sync failed: {}", e.getMessage());
            }
        });
    }

    /**
     * Paginates getWarehouses and upserts warehouses + derived cities, one transaction per page
     * (was one implicit transaction and one round trip per warehouse).
     */
    public void sync() throws Exception {
        String apiUrl = props.getNovaposhta().getApiUrl();
        if (apiUrl == null || apiUrl.isBlank()) {
            log.info("Nova Poshta apiUrl not configured — skipping sync.");
            return;
        }
        if (!running.compareAndSet(false, true)) {
            log.info("Nova Poshta sync already running — skipping this trigger.");
            return;
        }
        try {
            log.info("Starting Nova Poshta warehouse sync...");
            int page = 1;
            int total = 0;
            Map<String, NovaPoshtaCity> cities = new LinkedHashMap<>();

            while (page <= MAX_PAGES) {
                JsonNode data = fetchPage(apiUrl, page);
                if (data == null || !data.isArray() || data.isEmpty()) {
                    break;
                }
                List<JsonNode> batch = new ArrayList<>(data.size());
                data.forEach(batch::add);
                total += upsertService.upsertPage(batch, cities);
                if (data.size() < LIMIT) {
                    break;
                }
                page++;
            }

            upsertService.saveCities(cities.values());
            log.info("Nova Poshta sync done: {} warehouses, {} cities.", total, cities.size());
        } finally {
            running.set(false);
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

    /**
     * Separate bean purely so {@code @Transactional} is honoured (a call to a transactional method
     * on {@code this} would go straight to the implementation and get no transaction at all).
     */
    @Service
    public static class NovaPoshtaUpsertService {

        private final NovaPoshtaCityRepository cityRepository;
        private final NovaPoshtaWarehouseRepository warehouseRepository;

        public NovaPoshtaUpsertService(NovaPoshtaCityRepository cityRepository,
                                       NovaPoshtaWarehouseRepository warehouseRepository) {
            this.cityRepository = cityRepository;
            this.warehouseRepository = warehouseRepository;
        }

        /** Upserts a whole API page in one transaction. Returns how many warehouses were handled. */
        @Transactional
        public int upsertPage(List<JsonNode> warehouses, Map<String, NovaPoshtaCity> cities) {
            List<NovaPoshtaWarehouse> batch = new ArrayList<>(warehouses.size());
            for (JsonNode w : warehouses) {
                String ref = text(w, "Ref");
                if (ref == null || ref.isBlank()) {
                    continue;
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
                batch.add(wh);

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
            warehouseRepository.saveAll(batch);
            return batch.size();
        }

        @Transactional
        public void saveCities(Iterable<NovaPoshtaCity> cities) {
            cityRepository.saveAll(cities);
        }

        private static String text(JsonNode node, String field) {
            JsonNode v = node.get(field);
            return (v == null || v.isNull()) ? null : v.asText();
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
    }
}
