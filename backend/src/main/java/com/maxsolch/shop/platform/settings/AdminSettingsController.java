package com.maxsolch.shop.platform.settings;

import com.maxsolch.shop.platform.security.RequiredAdmin;
import com.maxsolch.shop.platform.settings.SettingsDtos.SettingsResponse;
import com.maxsolch.shop.platform.settings.SettingsDtos.SettingsUpdateRequest;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;


/**
 * The «Настройки» page: business settings that are safe to change at runtime (see
 * {@link SettingsRegistry} — secrets and infrastructure stay in .env and are never exposed here),
 * the read-only «Система» block is {@code delivery.api.AdminSystemController}.
 */
@RestController
@RequestMapping("/api/admin/settings")
@RequiredAdmin
@Tag(name = "Admin Settings", description = "Runtime shop settings")
@SecurityRequirement(name = "bearer-jwt")
public class AdminSettingsController {

    private final SettingsService settings;

    public AdminSettingsController(SettingsService settings) {
        this.settings = settings;
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
}
