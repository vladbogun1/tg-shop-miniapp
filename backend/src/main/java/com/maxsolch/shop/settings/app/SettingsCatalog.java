package com.maxsolch.shop.settings.app;

import com.maxsolch.shop.settings.domain.SettingDefinition;
import com.maxsolch.shop.settings.domain.SettingGroup;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * The closed list of settings the admin may change at runtime: the union of what the modules contribute
 * ({@link SettingsContribution}). A duplicate key or a definition of an unknown group stops the application at startup.
 */
@Component
public class SettingsCatalog {

    private final List<SettingGroup> groups;
    private final List<SettingDefinition> definitions;
    private final Map<String, SettingDefinition> byKey = new LinkedHashMap<>();

    public SettingsCatalog(List<SettingsContribution> contributions) {
        List<SettingGroup> allGroups = new ArrayList<>();
        List<SettingDefinition> all = new ArrayList<>();
        for (SettingsContribution c : contributions) {
            allGroups.addAll(c.groups());
            all.addAll(c.definitions());
        }
        for (SettingDefinition d : all) {
            if (byKey.put(d.key(), d) != null) {
                throw new IllegalStateException("Duplicate setting key " + d.key());
            }
            if (allGroups.stream().noneMatch(g -> g.id().equals(d.group()))) {
                throw new IllegalStateException("Unknown group " + d.group() + " of " + d.key());
            }
        }
        this.groups = List.copyOf(allGroups);
        this.definitions = List.copyOf(all);
    }

    public List<SettingGroup> groups() {
        return groups;
    }

    public List<SettingDefinition> all() {
        return definitions;
    }

    public Optional<SettingDefinition> find(String key) {
        return Optional.ofNullable(key == null ? null : byKey.get(key));
    }
}
