package com.maxsolch.shop.settings.app;

import com.maxsolch.shop.settings.domain.SettingDefinition;
import com.maxsolch.shop.settings.domain.SettingGroup;

import java.util.List;

/**
 * The settings of one module: the groups it adds to the admin page and the definitions of its keys. Every module that
 * has editable settings registers one bean (like {@code CacheSpec} for caches); {@link SettingsCatalog} collects them.
 * The order of the page is the {@code @Order} of the beans; inside a group the order of {@link #definitions()}.
 *
 * <p>Only business parameters belong here. Secrets and infrastructure (tokens, passwords, keys, service URLs, ports,
 * chat ids) stay in {@code .env} and are never exposed: a typo in one of those breaks the shop, and a leaked admin
 * session must not be able to read or redirect them. Every default is exactly the value the code used before the
 * setting existed, so a deployment with an empty {@code shop_settings} table behaves as it always did.
 */
public interface SettingsContribution {

    /** Groups declared by this module; a group may be filled by definitions of several modules. */
    default List<SettingGroup> groups() {
        return List.of();
    }

    List<SettingDefinition> definitions();
}
