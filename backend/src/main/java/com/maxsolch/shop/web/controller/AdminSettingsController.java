package com.maxsolch.shop.web.controller;

import com.maxsolch.shop.config.AppProperties;
import com.maxsolch.shop.novaposhta.NovaPoshtaSyncService;
import com.maxsolch.shop.repository.NovaPoshtaWarehouseRepository;
import com.maxsolch.shop.security.RequiredAdmin;
import com.maxsolch.shop.settings.SettingsDtos.SettingsResponse;
import com.maxsolch.shop.settings.SettingsDtos.SettingsUpdateRequest;
import com.maxsolch.shop.settings.SettingsDtos.SystemInfoDto;
import com.maxsolch.shop.settings.SettingsRegistry;
import com.maxsolch.shop.settings.SettingsService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.info.BuildProperties;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.time.format.DateTimeParseException;

/**
 * The «Настройки» page: business settings that are safe to change at runtime (see
 * {@link SettingsRegistry} — secrets and infrastructure stay in .env and are never exposed here),
 * plus a read-only «Система» block.
 */
@RestController
@RequestMapping("/api/admin/settings")
@RequiredAdmin
@Tag(name = "Admin Settings", description = "Runtime shop settings")
@SecurityRequirement(name = "bearer-jwt")
public class AdminSettingsController {

    private final SettingsService settings;
    private final AppProperties props;
    private final NovaPoshtaWarehouseRepository warehouseRepository;
    private final ObjectProvider<BuildProperties> buildProperties;

    public AdminSettingsController(SettingsService settings,
                                   AppProperties props,
                                   NovaPoshtaWarehouseRepository warehouseRepository,
                                   ObjectProvider<BuildProperties> buildProperties) {
        this.settings = settings;
        this.props = props;
        this.warehouseRepository = warehouseRepository;
        this.buildProperties = buildProperties;
    }

    @GetMapping
    @Operation(summary = "All editable settings with metadata, defaults and current values")
    public SettingsResponse list() {
        return settings.list();
    }

    @PutMapping
    @Operation(summary = "Save a batch of settings (null = reset to default); all-or-nothing")
    public SettingsResponse update(@RequestBody SettingsUpdateRequest body) {
        return settings.update(body == null ? null : body.values());
    }

    @GetMapping("/system")
    @Operation(summary = "Read-only system facts: release version, last Nova Poshta sync")
    public SystemInfoDto system() {
        BuildProperties build = buildProperties.getIfAvailable();
        // The image tag (v2.9.0) is the real release; the pom version is not bumped per release.
        String version = System.getenv("APP_VERSION");
        if (version == null || version.isBlank()) {
            version = build == null ? null : build.getVersion();
        }
        Long warehouses;
        try {
            warehouses = warehouseRepository.count();
        } catch (Exception e) {
            warehouses = null;
        }
        return new SystemInfoDto(
                version,
                build == null ? null : build.getTime(),
                props.getTimezone(),
                instant(settings.system(NovaPoshtaSyncService.SYSTEM_LAST_SYNC_AT).orElse(null)),
                settings.system(NovaPoshtaSyncService.SYSTEM_LAST_SYNC_SUMMARY).orElse(null),
                instant(settings.system(NovaPoshtaSyncService.SYSTEM_LAST_ERROR_AT).orElse(null)),
                settings.system(NovaPoshtaSyncService.SYSTEM_LAST_ERROR).orElse(null),
                warehouses,
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
