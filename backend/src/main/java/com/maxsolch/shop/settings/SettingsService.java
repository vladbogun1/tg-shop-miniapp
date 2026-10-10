package com.maxsolch.shop.settings;

import com.maxsolch.shop.audit.AdminAuditService;
import com.maxsolch.shop.settings.SettingsDtos.SettingItemDto;
import com.maxsolch.shop.settings.SettingsDtos.SettingsGroupDto;
import com.maxsolch.shop.settings.SettingsDtos.SettingsResponse;
import com.maxsolch.shop.web.BadRequestException;
import com.maxsolch.shop.web.SecurityUtil;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

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
    private static final String SYSTEM_TYPE = "SYSTEM";
    private static final int AUDIT_VALUE_CHARS = 40;

    /** Immutable copy of one row, so the cache never holds managed JPA entities. */
    record Stored(String value, Instant updatedAt, String updatedByName) {
    }

    private record Snapshot(Map<String, Stored> values, Instant loadedAt) {
    }

    private final ShopSettingRepository repository;
    private final AdminAuditService audit;
    private volatile Snapshot snapshot;

    public SettingsService(ShopSettingRepository repository, AdminAuditService audit) {
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

    /** Integer setting with the default from {@link SettingsRegistry}. */
    public int getInt(String key) {
        return get(key, Integer.parseInt(definition(key).defaultValue()));
    }

    /** Boolean setting with the default from {@link SettingsRegistry}. */
    public boolean getBool(String key) {
        return get(key, Boolean.parseBoolean(definition(key).defaultValue()));
    }

    /** Text setting with the default from {@link SettingsRegistry}. */
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
            row.setUpdatedAt(Instant.now());
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
        List<SettingsGroupDto> groups = SettingsRegistry.GROUPS.stream()
                .map(g -> new SettingsGroupDto(g.id(), g.title(), g.description()))
                .toList();
        List<SettingItemDto> items = SettingsRegistry.all().stream()
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
            SettingDefinition def = SettingsRegistry.find(e.getKey())
                    .orElseThrow(() -> new BadRequestException(
                            "Неизвестная настройка: " + e.getKey(), "SETTING_UNKNOWN"));
            normalized.put(def, e.getValue() == null ? null : normalize(def, e.getValue()));
        }

        // 2. apply, collecting the diff of effective values
        Map<String, ShopSetting> current = new HashMap<>();
        repository.findAllById(normalized.keySet().stream().map(SettingDefinition::key).toList())
                .forEach(row -> current.put(row.getKey(), row));
        Long adminId = currentAdminId();
        String adminName = audit.currentAdminName();
        Instant now = Instant.now();
        List<String> diff = new ArrayList<>();

        for (Map.Entry<SettingDefinition, String> e : normalized.entrySet()) {
            SettingDefinition def = e.getKey();
            String next = e.getValue();
            ShopSetting row = current.get(def.key());
            String before = row == null ? def.defaultValue() : row.getValue();
            if (next == null) {
                if (row != null) {
                    repository.delete(row);
                    diff.add(auditName(def) + ": " + show(def, before) + " → по умолчанию (" + show(def, def.defaultValue()) + ")");
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
                diff.add(auditName(def) + ": " + show(def, before) + " → " + show(def, next));
            }
        }

        if (!diff.isEmpty()) {
            audit.record("SETTINGS_UPDATE", "SETTINGS", null, String.join("; ", diff));
        }
        invalidateAfterCommit();
        // Re-read inside the transaction (JPA flushes first), so the answer shows what was written.
        return list();
    }

    // ------------------------------------------------------------------ validation

    /**
     * Validates {@code raw} against the definition and returns its canonical text form.
     *
     * @throws BadRequestException with a Russian message naming the setting
     */
    static String normalize(SettingDefinition def, Object raw) {
        String label = "«" + def.label() + "»";
        switch (def.type()) {
            case INT -> {
                long v;
                if (raw instanceof Number n) {
                    double d = n.doubleValue();
                    if (d != Math.rint(d) || Double.isInfinite(d)) {
                        throw invalid(label + ": нужно целое число");
                    }
                    v = n.longValue();
                } else if (raw instanceof String s) {
                    try {
                        v = Long.parseLong(s.trim());
                    } catch (NumberFormatException e) {
                        throw invalid(label + ": нужно целое число");
                    }
                } else {
                    throw invalid(label + ": нужно целое число");
                }
                if ((def.min() != null && v < def.min()) || (def.max() != null && v > def.max())) {
                    throw invalid(label + ": допустимо от " + def.min() + " до " + def.max());
                }
                return String.valueOf(v);
            }
            case BOOL -> {
                if (raw instanceof Boolean b) {
                    return b.toString();
                }
                if (raw instanceof String s && ("true".equalsIgnoreCase(s.trim()) || "false".equalsIgnoreCase(s.trim()))) {
                    return s.trim().toLowerCase();
                }
                throw invalid(label + ": нужно «да» или «нет»");
            }
            case STRING, TEXT -> {
                if (!(raw instanceof String s)) {
                    throw invalid(label + ": нужен текст");
                }
                String v = s.replace("\r\n", "\n").replace('\r', '\n').strip();
                if (def.type() == SettingType.STRING && v.indexOf('\n') >= 0) {
                    throw invalid(label + ": только одна строка");
                }
                if (def.maxLength() != null && v.length() > def.maxLength()) {
                    throw invalid(label + ": не длиннее " + def.maxLength() + " символов");
                }
                // Read as numbers by OnlinePaymentService.fiscalTaxCodes(): a word there was dropped
                // silently, and Вчасно.Каса then refuses every invoice without a tax code.
                if (SettingsRegistry.PAYMENT_FISCAL_TAX_CODES.equals(def.key())
                        && !v.isEmpty() && !v.matches("\\d+([,;\\s]+\\d+)*")) {
                    throw invalid(label + ": только числовые коды через запятую, например «1» или «1, 2»");
                }
                return v;
            }
            default -> throw new IllegalStateException("Unhandled type " + def.type());
        }
    }

    private static BadRequestException invalid(String message) {
        return new BadRequestException(message, "SETTING_INVALID");
    }

    // ------------------------------------------------------------------ internals

    private static SettingDefinition definition(String key) {
        return SettingsRegistry.find(key)
                .orElseThrow(() -> new IllegalArgumentException("Unknown setting " + key));
    }

    private static String systemKey(String key) {
        return key.startsWith(SettingsRegistry.SYSTEM_PREFIX) ? key : SettingsRegistry.SYSTEM_PREFIX + key;
    }

    private String raw(String key) {
        Stored s = values().get(key);
        return s == null ? null : s.value();
    }

    private Map<String, Stored> values() {
        Snapshot s = snapshot;
        if (s == null || s.loadedAt().plus(MAX_AGE).isBefore(Instant.now())) {
            s = load();
            snapshot = s;
        }
        return s.values();
    }

    private Snapshot load() {
        try {
            Map<String, Stored> map = new HashMap<>();
            for (ShopSetting row : repository.findAll()) {
                map.put(row.getKey(), new Stored(row.getValue(), row.getUpdatedAt(), row.getUpdatedByName()));
            }
            return new Snapshot(Map.copyOf(map), Instant.now());
        } catch (Exception e) {
            // Defaults everywhere is the pre-settings behaviour — far better than failing checkout.
            log.warn("Failed to load shop settings, using defaults: {}", e.getMessage());
            Snapshot stale = snapshot;
            return new Snapshot(stale == null ? Map.of() : stale.values(), Instant.now());
        }
    }

    void invalidate() {
        snapshot = null;
    }

    private void invalidateAfterCommit() {
        invalidate();
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            // A read before the commit (another thread: old rows; ours: uncommitted ones) would
            // otherwise stay cached for MAX_AGE — drop it again once the outcome is known.
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCompletion(int status) {
                    invalidate();
                }
            });
        }
    }

    private static SettingItemDto toDto(SettingDefinition d, Stored stored) {
        return new SettingItemDto(
                d.key(), d.group(), d.type().name(), d.label(), d.description(),
                typed(d, d.defaultValue()),
                stored == null ? typed(d, d.defaultValue()) : typed(d, stored.value()),
                stored != null,
                d.min(), d.max(), d.maxLength(), d.unit(),
                stored == null ? null : stored.updatedAt(),
                stored == null ? null : stored.updatedByName());
    }

    /** Canonical text → JSON-friendly value; an unparsable stored value shows as the default. */
    static Object typed(SettingDefinition d, String value) {
        try {
            return switch (d.type()) {
                case INT -> Long.parseLong(value.trim());
                case BOOL -> Boolean.parseBoolean(value.trim());
                case STRING, TEXT -> value == null ? "" : value;
            };
        } catch (RuntimeException e) {
            // Defaults are always valid, so this cannot recurse more than once.
            return d.defaultValue().equals(value) ? null : typed(d, d.defaultValue());
        }
    }

    /** «Журнал» is read by the owner: the label of «Настройки», not the technical key. */
    private static String auditName(SettingDefinition d) {
        return d.label() == null || d.label().isBlank() ? d.key() : "«" + d.label() + "»";
    }

    private static String show(SettingDefinition d, String value) {
        if (value == null) {
            return "—";
        }
        if (d.type() == SettingType.BOOL) {
            return Boolean.parseBoolean(value.trim()) ? "вкл" : "выкл";
        }
        if (d.type() == SettingType.STRING || d.type() == SettingType.TEXT) {
            if (value.isEmpty()) {
                return "(пусто)";
            }
            String flat = value.replace('\n', ' ');
            return "«" + (flat.length() <= AUDIT_VALUE_CHARS ? flat : flat.substring(0, AUDIT_VALUE_CHARS - 1) + "…") + "»";
        }
        return value;
    }

    private static Long currentAdminId() {
        try {
            return SecurityUtil.currentUserId();
        } catch (Exception e) {
            return null;
        }
    }
}
