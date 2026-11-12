package com.maxsolch.shop.delivery.app;

import com.maxsolch.shop.platform.jobs.Workers;
import com.maxsolch.shop.delivery.domain.NovaPoshtaApi;
import com.maxsolch.shop.delivery.domain.NovaPoshtaApi.ApiWarehouse;
import com.maxsolch.shop.delivery.domain.NovaPoshtaCity;
import com.maxsolch.shop.delivery.infra.NovaPoshtaWarehouseRepository;
import com.maxsolch.shop.settings.app.SettingsService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Syncs the Nova Poshta warehouse directory into the local DB (and derives cities). The nightly run is started by
 * {@link NovaPoshtaJobs}; this service also runs once on startup if the warehouse table is empty. Best-effort:
 * never blocks or crashes the context.
 *
 * <p>Background work runs on this service's own single daemon thread rather than through
 * {@code @Async} on a method of this same bean: a self-invocation bypasses the Spring proxy, so
 * the "async" startup sync actually ran inline on the ApplicationReadyEvent thread and stalled
 * boot for as long as ~35k warehouses took to fetch and insert. For the same reason the per-page
 * transaction is opened by {@link NovaPoshtaUpsertService} instead of a {@code @Transactional} method
 * called from within this class.
 *
 * <p>The thread is a named worker from {@link com.maxsolch.shop.platform.jobs.Workers} (not a Boot
 * {@code TaskExecutor}: this application registers its own {@code Executor} beans for the STOMP channels, so
 * Boot's one backs off and there is none to inject).
 */
@Slf4j
@Service
public class NovaPoshtaSyncService {

    private static final int LIMIT = 500;
    private static final int MAX_PAGES = 200; // safety cap

    private final NovaPoshtaApi api;
    private final NovaPoshtaWarehouseRepository warehouseRepository;
    private final NovaPoshtaUpsertService upsertService;
    private final SettingsService settings;
    private final Clock clock;
    private final NpAlerts alerts;
    private final NovaPoshtaSenderService sender;
    /** One thread of the platform workers: the sync is a rare, long, strictly serial job. */
    private final ExecutorService executor;
    /** Guards against a scheduled run starting while the previous one is still going. */
    private final AtomicBoolean running = new AtomicBoolean(false);

    public NovaPoshtaSyncService(NovaPoshtaApi api,
                                 NovaPoshtaWarehouseRepository warehouseRepository,
                                 NovaPoshtaUpsertService upsertService,
                                 SettingsService settings,
                                 Clock clock, Workers workers, NpAlerts alerts,
                                 NovaPoshtaSenderService sender) {
        this.api = api;
        this.warehouseRepository = warehouseRepository;
        this.upsertService = upsertService;
        this.settings = settings;
        this.clock = clock;
        this.alerts = alerts;
        this.sender = sender;
        this.executor = workers.single("np-sync");
    }

    @EventListener(ApplicationReadyEvent.class)
    public void onStartup() {
        try {
            if (warehouseRepository.count() == 0) {
                log.info("Nova Poshta warehouses table empty - scheduling initial sync.");
                syncAsync();
            }
        } catch (Exception e) {
            log.warn("Nova Poshta startup check failed: {}", e.getMessage());
        }
    }

    /** Runs the sync on a background thread. Safe to call from anywhere, including this bean. */
    public void syncAsync() {
        executor.execute(() -> {
            try {
                sync();
            } catch (Exception e) {
                log.warn("Nova Poshta sync failed: {}", e.getMessage());
                recordError(e.getMessage());
            }
        });
    }

    /**
     * The nightly trigger: the admin can pause it (Настройки → Доставка → Отслеживание) while the NP API misbehaves; the startup
     * sync of an empty table still runs, without it checkout has no warehouses.
     */
    void syncIfEnabled() {
        if (!settings.getBool(DeliverySettings.NOVAPOSHTA_AUTO_SYNC)) {
            log.info("Nova Poshta nightly sync disabled in settings - skipping.");
            return;
        }
        syncAsync();
    }

    private void recordError(String message) {
        settings.putSystem(NovaPoshtaSyncStatus.LAST_ERROR_AT, clock.instant().toString());
        settings.putSystem(NovaPoshtaSyncStatus.LAST_ERROR, String.valueOf(message));
        alerts.raise(NpAlerts.Kind.SYNC, "Справочник отделений не обновился: " + message);
    }

    /** Reads every page; returns {stored, 1 when the directory ended before the page cap}. */
    private int[] readPages(Map<String, NovaPoshtaCity> cities, Map<String, String> types, Instant started)
            throws IOException, InterruptedException {
        int total = 0;
        for (int page = 1; page <= MAX_PAGES; page++) {
            List<ApiWarehouse> data = api.warehousesPage(page, LIMIT);
            if (!data.isEmpty()) {
                total += upsertService.upsertPage(data, cities, types, started);
            }
            if (data.size() < LIMIT) {
                return new int[] {total, 1};
            }
        }
        return new int[] {total, 0};
    }

    /**
     * TypeOfWarehouse ref → POSTOMAT / BRANCH / POINT / OTHER from Address.getWarehouseTypes: a type NP adds is
     * classified by its name and shown on «Внимание», not silently dropped from the map filter. Empty when NP did
     * not answer — the built-in refs serve.
     */
    private Map<String, String> fetchTypes() {
        Map<String, String> out = new HashMap<>();
        try {
            List<String> unknown = new ArrayList<>();
            for (Map.Entry<String, String> t : api.warehouseTypes().entrySet()) {
                String cat = NovaPoshtaService.categoryOfTypeName(t.getKey(), t.getValue());
                out.put(t.getKey(), cat);
                if ("OTHER".equals(NovaPoshtaService.categoryOf(t.getKey()))) {
                    unknown.add(t.getValue() + " → " + cat);
                }
            }
            if (unknown.isEmpty()) {
                alerts.clear(NpAlerts.Kind.WAREHOUSE_TYPES);
            } else {
                alerts.raise(NpAlerts.Kind.WAREHOUSE_TYPES, "Новая почта завела типы отделений, которых магазин не "
                        + "знал: " + String.join("; ", unknown) + ". Разложены по названию — проверьте фильтр карты.");
            }
        } catch (IOException e) {
            log.warn("Nova Poshta getWarehouseTypes failed: {}", e.getMessage());
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
        return out;
    }

    /** The shop's own sending branches must still be open (closed sender branch = no waybills from it). */
    private void checkSenderBranches() {
        List<String> closed = new ArrayList<>();
        sender.get().ifPresent(cfg -> {
            if (cfg.warehouses() == null) {
                return;
            }
            for (NovaPoshtaSenderService.SenderWarehouse w : cfg.warehouses()) {
                warehouseRepository.findById(w.ref()).filter(x -> !x.isActive())
                        .ifPresent(x -> closed.add("№" + x.getNumber() + " " + x.getCityName()));
            }
        });
        if (closed.isEmpty()) {
            alerts.clear(NpAlerts.Kind.SENDER_BRANCH);
        } else {
            alerts.raise(NpAlerts.Kind.SENDER_BRANCH, "Отделение отправки закрыто или пропало из справочника: "
                    + String.join(", ", closed) + ". ТТН с него не создаются — выберите другое в «Настройки» → "
                    + "«Доставка» → «ТТН и отправитель».");
        }
    }

    /**
     * Paginates getWarehouses and upserts warehouses + derived cities, one transaction per page
     * (was one implicit transaction and one round trip per warehouse).
     */
    public void sync() throws Exception {
        if (!api.isConfigured()) {
            log.info("Nova Poshta apiUrl not configured - skipping sync.");
            return;
        }
        if (!running.compareAndSet(false, true)) {
            log.info("Nova Poshta sync already running - skipping this trigger.");
            return;
        }
        try {
            log.info("Starting Nova Poshta warehouse sync...");
            // seen_at is TIMESTAMP(0) and MySQL rounds fractions: whole seconds, or a run could close every row.
            Instant started = clock.instant().truncatedTo(ChronoUnit.SECONDS);
            Map<String, String> types = fetchTypes();
            Map<String, NovaPoshtaCity> cities = new LinkedHashMap<>();
            int[] run = readPages(cities, types, started);
            int total = run[0];
            boolean complete = run[1] == 1;

            upsertService.saveCities(cities.values());
            log.info("Nova Poshta sync done: {} warehouses, {} cities.", total, cities.size());
            if (total == 0) {
                // An empty first page is not a successful sync either.
                recordError("API Новой Почты не вернул ни одного отделения");
            } else {
                // Everything NP listed was stamped with this run; the rest closed or was removed. Only after a
                // full run (a page cap must not close half the country).
                int closed = complete ? upsertService.deactivateNotSeen(started) : 0;
                if (closed > 0) {
                    log.info("Nova Poshta sync: {} warehouses no longer listed - deactivated", closed);
                }
                alerts.clear(NpAlerts.Kind.SYNC);
                checkSenderBranches();
                settings.putSystem(NovaPoshtaSyncStatus.LAST_SYNC_AT, clock.instant().toString());
                settings.putSystem(NovaPoshtaSyncStatus.LAST_SYNC_SUMMARY,
                        "отделений: " + total + ", городов: " + cities.size());
            }
        } catch (IOException e) {
            // An API error (HTTP status, success:false, broken body) is a failed run, not the end of the directory.
            // Pages stored before the failure stay; nothing is deleted, so the existing directory is never wiped.
            log.warn("Nova Poshta sync failed: {}", e.getMessage());
            recordError(e.getMessage());
        } finally {
            running.set(false);
        }
    }
}
