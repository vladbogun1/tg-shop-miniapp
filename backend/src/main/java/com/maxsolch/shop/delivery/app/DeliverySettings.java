package com.maxsolch.shop.delivery.app;

import com.maxsolch.shop.settings.app.SettingsContribution;
import com.maxsolch.shop.settings.domain.SettingDefinition;
import com.maxsolch.shop.settings.domain.SettingGroup;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import java.util.List;

import static com.maxsolch.shop.settings.domain.SettingDefinition.boolSetting;
import static com.maxsolch.shop.settings.domain.SettingDefinition.intSetting;
import static com.maxsolch.shop.settings.domain.SettingDefinition.selectSetting;
import static com.maxsolch.shop.settings.domain.SettingDefinition.textSetting;

/**
 * Nova Poshta directory refresh.
 *
 * <p>The keys are the contract with the stored rows and the admin page: they never change. {@code @Order} fixes the
 * place of the group on the settings page.
 */
@Component
@Order(80)
public class DeliverySettings implements SettingsContribution {

    public static final String NOVAPOSHTA_AUTO_SYNC = "novaposhta.autoSync";

    @Override
    public List<SettingGroup> groups() {
        return List.of(
                new SettingGroup("novaposhta", "Новая Почта", "Справочник отделений и почтоматов."));
    }

    @Override
    public List<SettingDefinition> definitions() {
        return List.of(
            boolSetting(NOVAPOSHTA_AUTO_SYNC, "novaposhta",
                    "Обновлять отделения каждую ночь",
                    "Каждую ночь бэкенд подтягивает свежий список отделений и почтоматов. "
                            + "Выключайте, только если API Новой Почты сбоит.",
                    true));
    }
}
