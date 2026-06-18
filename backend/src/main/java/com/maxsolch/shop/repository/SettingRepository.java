package com.maxsolch.shop.repository;

import com.maxsolch.shop.domain.Setting;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SettingRepository extends JpaRepository<Setting, String> {
}
