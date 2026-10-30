package com.maxsolch.shop.settings.app;

import com.maxsolch.shop.settings.app.SettingsDtos.SettingItemDto;
import com.maxsolch.shop.settings.app.SettingsDtos.SettingsGroupDto;
import com.maxsolch.shop.settings.app.SettingsDtos.SettingsResponse;
import com.maxsolch.shop.settings.domain.SettingDefinition;
import com.maxsolch.shop.settings.domain.SettingsSaved;
import com.maxsolch.shop.settings.domain.ShopSetting;
import com.maxsolch.shop.settings.infra.ShopSettingRepository;
import com.maxsolch.shop.platform.error.PlatformError;
import java.time.Clock;
import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.platform.error.ErrorCode;
import com.maxsolch.shop.audit.app.AdminAuditService;
import com.maxsolch.shop.platform.cache.CacheConfig;
import com.maxsolch.shop.platform.tx.DomainEvents;
import com.maxsolch.shop.platform.tx.OnCompleted;
import com.maxsolch.shop.platform.web.CurrentActor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.cache.Cache;
import org.springframework.cache.CacheManager;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Runtime shop settings: typed reads with a fallback default, and the admin's batch update.
 *
 * <p>Reads never hit the database per call: all rows are held in an in-memory snapshot that is
 * dropped after every save (again once the transaction completes) and, as a safety net for edits made
 * straight in the DB, re-read at most every {@link #MAX_AGE}. If the table cannot be read at
 * all, every getter answers with its default — the shop keeps working exactly as before settings
 * existed, which is also what an empty table means.
 */
@Slf4j
@Service
public class SettingsService {

    static final Duration MAX_AGE = Duration.ofSeconds(60);
    /** Keys the backend writes about itself; never listed or editable in the admin. */
    public static final String SYSTEM_PREFIX = "system.";
    private static final String SYSTEM_TYPE = "SYSTEM";
    private static final int AUDIT_VALUE_CHARS = 40;

    /** Immutable copy of one row, so the cache never holds managed JPA entities. */
    record Stored(String value, Instant updatedAt, String updatedByName) {
    }

    private final SettingsCatalog catalog;
    private final ShopSettingRepository repository;
    private final AdminAuditService audit;
    private final CurrentActor actor;
    private final DomainEvents events;
    private final Clock clock;
    private final Cache snapshot;
    private final Cache lastGood;

    public SettingsService(SettingsCatalog catalog, ShopSettingRepository repository, AdminAuditService audit, CurrentActor actor,
                           DomainEvents events, Clock clock, CacheManager caches) {
        this.catalog = catalog;
        this.clock = clock;
        this.snapshot = CacheConfig.require(caches, SettingsCaches.SNAPSHOT.name());
        this.lastGood = CacheConfig.require(caches, SettingsCaches.LAST_GOOD.name());
        this.actor = actor;
        this.events = events;
        this.repository = repository;
        this.audit = audit;
    }

    // ------------------------------------------------------------------ typed reads

    /** Stored value of {@code key}, or {@code def} when it is not set or not a valid integer. */
    public int get(String key, int def) {
        String raw = raw(key);
        if (raw == null) {
            return def;
        }
        try {
            return Integer.parseInt(raw.trim());
        } catch (NumberFormatException e) {
            log.warn("Setting {} is not an integer: '{}' — using default {}", key, raw, def);
            return def;
        }
    }

    /** Stored value of {@code key}, or {@code def} when it is not set or not a boolean. */
    public boolean get(String key, boolean def) {
        String raw = raw(key);
        if (raw == null) {
            return def;
        }
        String v = raw.trim();
        if ("true".equalsIgnoreCase(v)) {
            return true;
        }
        if ("false".equalsIgnoreCase(v)) {
            return false;
        }
        log.warn("Setting {} is not a boolean: '{}' — using default {}", key, raw, def);
        return def;
    }

    /** Stored value of {@code key}, or {@code def} when it is not set. */
    public String get(String key, String def) {
        String raw = raw(key);
        return raw == null ? def : raw;
    }

    /** Integer setting with the default from the {@link SettingsCatalog}. */
    public int getInt(String key) {
        return get(key, Integer.parseInt(definition(key).defaultValue()));
    }

    /** Boolean setting with the default from the {@link SettingsCatalog}. */
    public boolean getBool(String key) {
        return get(key, Boolean.parseBoolean(definition(key).defaultValue()));
    }

    /** Text setting with the default from the {@link SettingsCatalog}. */
    public String getString(String key) {
        return get(key, definition(key).defaultValue());
    }

    // ------------------------------------------------------------------ system keys

    /** Value the backend recorded about itself (e.g. last Nova Poshta sync), if any. */
    public Optional<String> system(String key) {
        return Optional.ofNullable(raw(systemKey(key)));
    }

    /**
     * Records a backend-owned fact under {@code system.*}. Best-effort: a failure is logged and
     * swallowed, since it is bookkeeping and must never break the job that reports it.
     */
    public void putSystem(String key, String value) {
        String k = systemKey(key);
        try {
            ShopSetting row = repository.findById(k).orElseGet(ShopSetting::new);
            row.setKey(k);
            row.setType(SYSTEM_TYPE);
            row.setValue(value);
            row.setUpdatedAt(clock.instant());
            row.setUpdatedBy(null);
            row.setUpdatedByName(null);
            repository.save(row);
            invalidate();
        } catch (Exception e) {
            log.warn("Failed to record system setting {}: {}", k, e.getMessage());
        }
    }

    // ------------------------------------------------------------------ admin API

    /** All editable settings with metadata, current and default values. */
    public SettingsResponse list() {
        Map<String, Stored> values = values();
        List<SettingsGroupDto> groups = catalog.groups().stream()
                .map(g -> new SettingsGroupDto(g.id(), g.title(), g.description()))
                .toList();
        List<SettingItemDto> items = catalog.all().stream()
                .map(d -> toDto(d, values.get(d.key())))
                .toList();
        return new SettingsResponse(groups, items);
    }

    /**
     * Applies a batch of changes atomically: everything is validated first, so one bad value
     * rejects the whole batch with nothing written. {@code null} resets a key to its default.
     * Writes one audit entry with the diff of effective values.
     */
    @Transactional
    public SettingsResponse update(Map<String, Object> changes) {
        if (changes == null || changes.isEmpty()) {
            return list();
        }
        // 1. validate everything up front
        Map<SettingDefinition, String> normalized = new LinkedHashMap<>();
        for (Map.Entry<String, Object> e : changes.entrySet()) {
            SettingDefinition def = catalog.find(e.getKey())
                    .orElseThrow(() -> new DomainException.BadRequest(PlatformError.SETTING_UNKNOWN, e.getKey()));
            normalized.put(def, e.getValue() == null ? null : SettingNormalizer.normalize(def, e.getValue()));
        }

        // 2. apply, collecting the diff of effective values
        Map<String, ShopSetting> current = new HashMap<>();
        repository.findAllById(normalized.keySet().stream().map(SettingDefinition::key).toList())
                .forEach(row -> current.put(row.getKey(), row));
        Long adminId = currentAdminId();
        String adminName = audit.currentAdminName();
        Instant now = clock.instant();
        List<String> diff = new ArrayList<>();

        for (Map.Entry<SettingDefinition, String> e : normalized.entrySet()) {
            SettingDefinition def = e.getKey();
            String next = e.getValue();
            ShopSetting row = current.get(def.key());
            String before = row == null ? def.defaultValue() : row.getValue();
            if (next == null) {
                if (row != null) {
                    repository.delete(row);
                    diff.add(SettingNormalizer.auditName(def) + ": " + SettingNormalizer.show(def, before) + " → по умолчанию (" + SettingNormalizer.show(def, def.defaultValue()) + ")");
                }
                continue;
            }
            if (row != null && next.equals(row.getValue())) {
                continue;
            }
            if (row == null) {
                row = new ShopSetting();
                row.setKey(def.key());
            }
            row.setType(def.type().name());
            row.setValue(next);
            row.setUpdatedAt(now);
            row.setUpdatedBy(adminId);
            row.setUpdatedByName(adminName);
            repository.save(row);
            if (!next.equals(before)) {
                diff.add(SettingNormalizer.auditName(def) + ": " + SettingNormalizer.show(def, before) + " → " + SettingNormalizer.show(def, next));
            }
        }

        if (!diff.isEmpty()) {
            audit.record("SETTINGS_UPDATE", "SETTINGS", null, String.join("; ", diff));
        }
        invalidateAfterCommit();
        // Re-read inside the transaction (JPA flushes first), so the answer shows what was written.
        return list();
    }

    /** Decimal text setting ({@code 1.3}) with the registry default when unset or not a number. */
    public java.math.BigDecimal getDecimal(String key) {
        String raw = get(key, definition(key).defaultValue());
        try {
            return new java.math.BigDecimal(raw.trim().replace(',', '.'));
        } catch (NumberFormatException e) {
            log.warn("Setting {} is not a number: '{}' — using default", key, raw);
            return new java.math.BigDecimal(definition(key).defaultValue());
        }
    }

    private static DomainException.BadRequest invalid(PlatformError reason, Object... args) {
        return new DomainException.BadRequest(reason, args);
    }

    // ------------------------------------------------------------------ internals

    private SettingDefinition definition(String key) {
        return catalog.find(key)
                .orElseThrow(() -> new IllegalArgumentException("Unknown setting " + key));
    }

    private static String systemKey(String key) {
        return key.startsWith(SYSTEM_PREFIX) ? key : SYSTEM_PREFIX + key;
    }

    private String raw(String key) {
        Stored s = values().get(key);
        return s == null ? null : s.value();
    }

    private Map<String, Stored> values() {
        Map<String, Stored> s = rows(snapshot);
        if (s == null) {
            s = load();
            snapshot.put(SettingsCaches.KEY, s);
        }
        return s;
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Stored> rows(Cache cache) {
        return cache.get(SettingsCaches.KEY, Map.class);
    }

    private Map<String, Stored> load() {
        try {
            Map<String, Stored> map = new HashMap<>();
            for (ShopSetting row : repository.findAll()) {
                map.put(row.getKey(), new Stored(row.getValue(), row.getUpdatedAt(), row.getUpdatedByName()));
            }
            Map<String, Stored> loaded = Map.copyOf(map);
            lastGood.put(SettingsCaches.KEY, loaded);
            return loaded;
        } catch (Exception e) {
            // Defaults everywhere is the pre-settings behaviour — far better than failing checkout.
            log.warn("Failed to load shop settings, using defaults: {}", e.getMessage());
            Map<String, Stored> stale = rows(lastGood);
            return stale == null ? Map.of() : stale;
        }
    }

    void invalidate() {
        snapshot.clear();
        lastGood.clear();
    }

    private void invalidateAfterCommit() {
        invalidate();
        // A read before the commit (another thread: old rows; ours: uncommitted ones) would otherwise stay cached
        // for MAX_AGE — drop it again once the outcome is known. AFTER_COMPLETION, not AFTER_COMMIT: after a rollback
        // the snapshot may hold uncommitted values and must go too (the pre-event code used afterCompletion).
        events.publish(new SettingsSaved());
    }

    @OnCompleted
    public void onTransactionCompleted(SettingsSaved event) {
        invalidate();
    }

    private SettingItemDto toDto(SettingDefinition d, Stored stored) {
        return new SettingItemDto(
                d.key(), d.group(), d.type().name(), d.label(), d.description(),
                SettingNormalizer.typed(d, d.defaultValue()),
                stored == null ? SettingNormalizer.typed(d, d.defaultValue()) : SettingNormalizer.typed(d, stored.value()),
                stored != null,
                d.min(), d.max(), d.maxLength(), d.unit(),
                stored == null ? null : stored.updatedAt(),
                stored == null ? null : stored.updatedByName(),
                d.options());
    }

    private Long currentAdminId() {
        try {
            return actor.userId();
        } catch (Exception e) {
            return null;
        }
    }
}
