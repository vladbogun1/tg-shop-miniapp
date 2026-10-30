package com.maxsolch.shop.order.app;

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
 * Whether the bot tells the customer about order status changes (read by the order, review and gift notifiers).
 *
 * <p>The keys are the contract with the stored rows and the admin page: they never change. {@code @Order} fixes the
 * place of the group on the settings page.
 */
@Component
@Order(40)
public class OrderSettings implements SettingsContribution {

    public static final String NOTIFY_CUSTOMER_STATUS = "notify.customerStatus";

    @Override
    public List<SettingGroup> groups() {
        return List.of(
                new SettingGroup("notifications", "Уведомления", "Что бот пишет покупателям."));
    }

    @Override
    public List<SettingDefinition> definitions() {
        return List.of(
            boolSetting(NOTIFY_CUSTOMER_STATUS, "notifications",
                    "Сообщать покупателю о смене статуса",
                    "Бот пишет покупателю в Telegram, когда заказ принят, отправлен, доставлен или отменён. "
                            + "Можно выключить на время массовой правки статусов.",
                    true));
    }
}
