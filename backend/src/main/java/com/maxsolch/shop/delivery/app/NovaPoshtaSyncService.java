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

import java.time.Clock;
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
    /** One thread of the platform workers: the sync is a rare, long, strictly serial job. */
    private final ExecutorService executor;
    /** Guards against a scheduled run starting while the previous one is still going. */
    private final AtomicBoolean running = new AtomicBoolean(false);

    public NovaPoshtaSyncService(NovaPoshtaApi api,
                                 NovaPoshtaWarehouseRepository warehouseRepository,
                                 NovaPoshtaUpsertService upsertService,
                                 SettingsService settings,
                                 Clock clock, Workers workers) {
        this.api = api;
        this.warehouseRepository = warehouseRepository;
        this.upsertService = upsertService;
        this.settings = settings;
        this.clock = clock;
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
                settings.putSystem(NovaPoshtaSyncStatus.LAST_ERROR_AT, clock.instant().toString());
                settings.putSystem(NovaPoshtaSyncStatus.LAST_ERROR, String.valueOf(e.getMessage()));
            }
        });
    }

    /**
     * The nightly trigger: the admin can pause it (Настройки → Новая Почта) while the NP API misbehaves; the startup
     * sync of an empty table still runs, without it checkout has no warehouses.
     */
    void syncIfEnabled() {
        if (!settings.getBool(DeliverySettings.NOVAPOSHTA_AUTO_SYNC)) {
            log.info("Nova Poshta nightly sync disabled in settings - skipping.");
            return;
        }
        syncAsync();
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
            int page = 1;
            int total = 0;
            Map<String, NovaPoshtaCity> cities = new LinkedHashMap<>();

            while (page <= MAX_PAGES) {
                List<ApiWarehouse> data = api.warehousesPage(page, LIMIT);
                if (data.isEmpty()) {
                    break;
                }
                total += upsertService.upsertPage(data, cities);
                if (data.size() < LIMIT) {
                    break;
                }
                page++;
            }

            upsertService.saveCities(cities.values());
            log.info("Nova Poshta sync done: {} warehouses, {} cities.", total, cities.size());
            if (total == 0) {
                // A non-200 or an empty first page is not a successful sync, whatever the log says.
                settings.putSystem(NovaPoshtaSyncStatus.LAST_ERROR_AT, clock.instant().toString());
                settings.putSystem(NovaPoshtaSyncStatus.LAST_ERROR, "API Новой Почты не вернул ни одного отделения");
            } else {
                settings.putSystem(NovaPoshtaSyncStatus.LAST_SYNC_AT, clock.instant().toString());
                settings.putSystem(NovaPoshtaSyncStatus.LAST_SYNC_SUMMARY,
                        "отделений: " + total + ", городов: " + cities.size());
            }
        } finally {
            running.set(false);
        }
    }
}
