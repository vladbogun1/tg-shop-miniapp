package com.maxsolch.shop.settings;

import java.time.Instant;
import java.util.List;
import java.util.Map;

/** Wire shapes of the admin settings API. */
public final class SettingsDtos {

    private SettingsDtos() {
    }

    /**
     * One setting as the editor sees it. {@code value}/{@code defaultValue} are typed: a number
     * for INT, a boolean for BOOL, a string for STRING/TEXT.
     */
    public record SettingItemDto(
            String key,
            String group,
            String type,
            String label,
            String description,
            Object defaultValue,
            Object value,
            /** true = a stored value is in effect; false = the default applies. */
            boolean overridden,
            Long min,
            Long max,
            Integer maxLength,
            String unit,
            Instant updatedAt,
            String updatedBy) {
    }

    public record SettingsGroupDto(String id, String title, String description) {
    }

    public record SettingsResponse(List<SettingsGroupDto> groups, List<SettingItemDto> items) {
    }

    /**
     * Batch update: key → new value. A {@code null} value resets the key to its default
     * (the stored row is removed). Keys not present are left untouched.
     */
    public record SettingsUpdateRequest(Map<String, Object> values) {
    }

    /** Read-only facts for the «Система» block. Any field may be null when unknown. */
    public record SystemInfoDto(
            String version,
            Instant buildTime,
            String timezone,
            Instant npLastSyncAt,
            String npLastSyncSummary,
            Instant npLastErrorAt,
            String npLastError,
            Long npWarehouses,
            boolean npAutoSync) {
    }
}
