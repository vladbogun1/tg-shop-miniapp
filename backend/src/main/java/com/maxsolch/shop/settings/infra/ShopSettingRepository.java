package com.maxsolch.shop.settings.infra;

import com.maxsolch.shop.settings.domain.ShopSetting;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ShopSettingRepository extends JpaRepository<ShopSetting, String> {
}
