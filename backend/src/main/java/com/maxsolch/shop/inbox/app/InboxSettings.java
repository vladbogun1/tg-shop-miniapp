package com.maxsolch.shop.inbox.app;

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
 * When an order lands on the «Внимание» screen.
 *
 * <p>The keys are the contract with the stored rows and the admin page: they never change. {@code @Order} fixes the
 * place of the group on the settings page.
 */
@Component
@Order(90)
public class InboxSettings implements SettingsContribution {

    public static final String INBOX_NEW_STALE_HOURS = "inbox.newStaleHours";
    public static final String INBOX_APPROVED_STALE_HOURS = "inbox.approvedStaleHours";

    @Override
    public List<SettingGroup> groups() {
        return List.of(
                new SettingGroup("inbox", "Внимание", "Когда заказ попадает на экран «Внимание» как застрявший."));
    }

    @Override
    public List<SettingDefinition> definitions() {
        return List.of(
            intSetting(INBOX_NEW_STALE_HOURS, "inbox",
                    "Новый заказ без одобрения дольше",
                    "Новый заказ, который не одобрили за это время, появляется на экране «Внимание».",
                    3, 1, 168, "ч"),
            intSetting(INBOX_APPROVED_STALE_HOURS, "inbox",
                    "Одобрен, но не отправлен дольше",
                    "Одобренный заказ, который не отправили за это время (считая от одобрения), "
                            + "появляется на экране «Внимание».",
                    24, 1, 720, "ч"));
    }
}
