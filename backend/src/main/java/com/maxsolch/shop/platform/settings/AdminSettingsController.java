package com.maxsolch.shop.platform.settings;

import com.maxsolch.shop.platform.config.AppProperties;
import com.maxsolch.shop.delivery.app.NovaPoshtaSyncStatus;
import com.maxsolch.shop.platform.security.RequiredAdmin;
import com.maxsolch.shop.platform.settings.SettingsDtos.SettingsResponse;
import com.maxsolch.shop.platform.settings.SettingsDtos.SettingsUpdateRequest;
import com.maxsolch.shop.platform.settings.SettingsDtos.SystemInfoDto;
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
    private final NovaPoshtaSyncStatus npSyncStatus;
    private final ObjectProvider<BuildProperties> buildProperties;

    public AdminSettingsController(SettingsService settings,
                                   AppProperties props,
                                   NovaPoshtaSyncStatus npSyncStatus,
                                   ObjectProvider<BuildProperties> buildProperties) {
        this.settings = settings;
        this.props = props;
        this.npSyncStatus = npSyncStatus;
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
        NovaPoshtaSyncStatus.Snapshot np = npSyncStatus.snapshot();
        return new SystemInfoDto(
                version,
                build == null ? null : build.getTime(),
                props.getTimezone(),
                np.lastSyncAt(),
                np.lastSyncSummary(),
                np.lastErrorAt(),
                np.lastError(),
                np.warehouses(),
                np.autoSync());
    }
}
