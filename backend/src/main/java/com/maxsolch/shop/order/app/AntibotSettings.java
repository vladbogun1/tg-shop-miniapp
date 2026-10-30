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
import static com.maxsolch.shop.preorder.app.PreorderSettings.ANTIBOT_MAX_QTY_PER_PRODUCT;

/**
 * Anti-bot limits on placing orders (OrderGuard). The per-product limit is also read by the pre-order queue, so its key lives in preorder.
 *
 * <p>The keys are the contract with the stored rows and the admin page: they never change. {@code @Order} fixes the
 * place of the group on the settings page.
 */
@Component
@Order(100)
public class AntibotSettings implements SettingsContribution {

    // Anti-bot / anti-hoarding limits on placing orders (OrderGuard). 0 = no limit.
    public static final String ANTIBOT_MAX_UNPAID_ORDERS = "antibot.maxUnpaidOrders";
    public static final String ANTIBOT_ORDER_COOLDOWN_SEC = "antibot.orderCooldownSec";
    public static final String ANTIBOT_MAX_ORDERS_PER_DAY = "antibot.maxOrdersPerDay";
    public static final String ANTIBOT_MAX_UNITS_PER_ORDER = "antibot.maxUnitsPerOrder";
    public static final String ANTIBOT_MAX_SELF_CANCELS_PER_DAY = "antibot.maxSelfCancelsPerDay";

    @Override
    public List<SettingGroup> groups() {
        return List.of(
                new SettingGroup("antibot", "Защита от ботов и спама",
                    "Лимиты на оформление заказов: против ботов и скупки товара. 0 — без ограничения."));
    }

    @Override
    public List<SettingDefinition> definitions() {
        return List.of(
            intSetting(ANTIBOT_MAX_UNPAID_ORDERS, "antibot",
                    "Неоплаченных заказов одновременно",
                    "Сколько неоплаченных (новых или одобренных) заказов может висеть у одного покупателя. "
                            + "Следующий заказ — только после оплаты или отмены. 0 — без ограничения.",
                    2, 0, 50, "шт"),
            intSetting(ANTIBOT_ORDER_COOLDOWN_SEC, "antibot",
                    "Пауза между заказами",
                    "Минимальный промежуток между двумя заказами одного покупателя. 0 — без паузы.",
                    60, 0, 3600, "сек"),
            intSetting(ANTIBOT_MAX_ORDERS_PER_DAY, "antibot",
                    "Заказов за сутки",
                    "Сколько заказов покупатель может оформить за последние 24 часа. 0 — без ограничения.",
                    5, 0, 100, "шт"),
            intSetting(ANTIBOT_MAX_QTY_PER_PRODUCT, "antibot",
                    "Штук одного товара в заказе",
                    "Максимум одинаковых товаров (одного варианта) в одном заказе — против скупки. "
                            + "Корзина не даст положить больше. 0 — без ограничения.",
                    5, 0, 1000, "шт"),
            intSetting(ANTIBOT_MAX_UNITS_PER_ORDER, "antibot",
                    "Всего штук в заказе",
                    "Сколько единиц товара всего может быть в одном заказе. 0 — без ограничения.",
                    20, 0, 10000, "шт"),
            intSetting(ANTIBOT_MAX_SELF_CANCELS_PER_DAY, "antibot",
                    "Своих отмен за сутки",
                    "Если покупатель сам отменил столько заказов за 24 часа, новые заказы ему недоступны "
                            + "до конца этого окна. 0 — без ограничения.",
                    3, 0, 100, "шт"));
    }
}
