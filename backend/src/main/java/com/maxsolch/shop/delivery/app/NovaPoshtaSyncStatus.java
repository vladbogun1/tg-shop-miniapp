package com.maxsolch.shop.delivery.app;

import com.maxsolch.shop.delivery.infra.NovaPoshtaWarehouseRepository;
import com.maxsolch.shop.platform.settings.SettingsRegistry;
import com.maxsolch.shop.platform.settings.SettingsService;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.format.DateTimeParseException;

/** What the admin «Настройки → Система» block shows about the Nova Poshta directory sync (read-only). */
@Service
public class NovaPoshtaSyncStatus {

    /** System keys (shop_settings) the sync writes and this read-model reads. */
    public static final String LAST_SYNC_AT = "np.lastSyncAt";
    public static final String LAST_SYNC_SUMMARY = "np.lastSyncSummary";
    public static final String LAST_ERROR_AT = "np.lastErrorAt";
    public static final String LAST_ERROR = "np.lastError";

    private final SettingsService settings;
    private final NovaPoshtaWarehouseRepository warehouses;

    public NovaPoshtaSyncStatus(SettingsService settings, NovaPoshtaWarehouseRepository warehouses) {
        this.settings = settings;
        this.warehouses = warehouses;
    }

    /**
     * @param warehouses how many warehouses are stored; null when the table could not be read
     * @param autoSync   whether the nightly sync is switched on
     */
    public record Snapshot(Instant lastSyncAt, String lastSyncSummary, Instant lastErrorAt, String lastError,
                           Long warehouses, boolean autoSync) {
    }

    public Snapshot snapshot() {
        Long count;
        try {
            count = warehouses.count();
        } catch (Exception e) {
            count = null;
        }
        return new Snapshot(
                instant(settings.system(LAST_SYNC_AT).orElse(null)),
                settings.system(LAST_SYNC_SUMMARY).orElse(null),
                instant(settings.system(LAST_ERROR_AT).orElse(null)),
                settings.system(LAST_ERROR).orElse(null),
                count,
                settings.getBool(SettingsRegistry.NOVAPOSHTA_AUTO_SYNC));
    }

    private static Instant instant(String raw) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        try {
            return Instant.parse(raw.trim());
        } catch (DateTimeParseException e) {
            return null;
        }
    }
}
