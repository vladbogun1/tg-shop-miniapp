package com.maxsolch.shop.settings.domain;

/**
 * A section of the settings page. {@code financeOnly}: the section (its definitions, their values and their saving)
 * exists only for an admin with the «Финансы» right; any other admin neither sees nor changes it, the server decides.
 */
public record SettingGroup(String id, String title, String description, boolean financeOnly) {

    public SettingGroup(String id, String title, String description) {
        this(id, title, description, false);
    }
}
