package com.maxsolch.shop.delivery.api;

import com.maxsolch.shop.delivery.app.NovaPoshtaSyncStatus;
import com.maxsolch.shop.platform.config.AppProperties;
import com.maxsolch.shop.platform.security.RequiredAdmin;
import com.maxsolch.shop.settings.app.SettingsDtos.SystemInfoDto;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.info.BuildProperties;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * The read-only «Система» block of the settings page. It reports the Nova Poshta sync, so it lives with delivery;
 * the URL stays under {@code /api/admin/settings} where the admin app calls it.
 */
@RestController
@RequestMapping("/api/admin/settings")
@RequiredAdmin
@Tag(name = "Admin Settings", description = "Runtime shop settings")
@SecurityRequirement(name = "bearer-jwt")
public class AdminSystemController {

    private final AppProperties props;
    private final NovaPoshtaSyncStatus npSyncStatus;
    private final ObjectProvider<BuildProperties> buildProperties;

    public AdminSystemController(AppProperties props, NovaPoshtaSyncStatus npSyncStatus,
                                 ObjectProvider<BuildProperties> buildProperties) {
        this.props = props;
        this.npSyncStatus = npSyncStatus;
        this.buildProperties = buildProperties;
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
