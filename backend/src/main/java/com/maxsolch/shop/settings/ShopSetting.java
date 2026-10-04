package com.maxsolch.shop.settings;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

import java.time.Instant;

/**
 * One stored override of a shop setting. A missing row means "use the default from
 * {@link SettingsRegistry}" — an empty table behaves exactly like the code did before settings.
 */
@Getter
@Setter
@Entity
@Table(name = "shop_settings")
public class ShopSetting {

    @Id
    @Column(name = "setting_key", nullable = false, length = 64)
    private String key;

    /** Canonical text form of the value (see {@link SettingType}). */
    @Column(name = "setting_value", columnDefinition = "TEXT")
    private String value;

    @Column(name = "value_type", nullable = false, length = 16)
    private String type;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    /** telegram_user_id of the admin; null when the backend itself wrote it (system keys). */
    @Column(name = "updated_by")
    private Long updatedBy;

    @Column(name = "updated_by_name", length = 255)
    private String updatedByName;
}
