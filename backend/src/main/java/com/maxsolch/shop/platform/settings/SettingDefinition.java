package com.maxsolch.shop.platform.settings;

/**
 * Metadata of one editable setting: where it shows up in the admin, how to validate it and what
 * applies when nothing is stored.
 *
 * @param key          stable id, e.g. {@code promo.holdMinutes}
 * @param group        id of a {@link SettingsRegistry.Group}
 * @param type         value type
 * @param label        Russian label for the admin UI
 * @param description  Russian hint: what it changes and where
 * @param defaultValue canonical text of the default (the value the code used before settings)
 * @param min          INT only: inclusive lower bound
 * @param max          INT only: inclusive upper bound
 * @param maxLength    STRING/TEXT only: max characters
 * @param unit         short unit for the UI ("мин", "дн.", "шт"), may be null
 * @param options      SELECT only: the allowed values with their Russian labels
 */
public record SettingDefinition(
        String key,
        String group,
        SettingType type,
        String label,
        String description,
        String defaultValue,
        Long min,
        Long max,
        Integer maxLength,
        String unit,
        java.util.List<Option> options) {

    /** One choice of a SELECT setting. */
    public record Option(String value, String label) {
    }

    public SettingDefinition(String key, String group, SettingType type, String label, String description,
                             String defaultValue, Long min, Long max, Integer maxLength, String unit) {
        this(key, group, type, label, description, defaultValue, min, max, maxLength, unit, null);
    }

    static SettingDefinition selectSetting(String key, String group, String label, String description,
                                           String defaultValue, java.util.List<Option> options) {
        return new SettingDefinition(key, group, SettingType.SELECT, label, description, defaultValue, null, null,
                null, null, options);
    }

    static SettingDefinition intSetting(String key, String group, String label, String description,
                                        int defaultValue, long min, long max, String unit) {
        return new SettingDefinition(key, group, SettingType.INT, label, description,
                String.valueOf(defaultValue), min, max, null, unit);
    }

    static SettingDefinition boolSetting(String key, String group, String label, String description,
                                         boolean defaultValue) {
        return new SettingDefinition(key, group, SettingType.BOOL, label, description,
                String.valueOf(defaultValue), null, null, null, null);
    }

    static SettingDefinition textSetting(String key, String group, String label, String description,
                                         String defaultValue, int maxLength) {
        return new SettingDefinition(key, group, SettingType.TEXT, label, description,
                defaultValue, null, null, maxLength, null);
    }
}
