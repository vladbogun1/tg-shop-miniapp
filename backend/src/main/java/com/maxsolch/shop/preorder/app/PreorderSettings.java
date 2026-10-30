package com.maxsolch.shop.preorder.app;

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
import static com.maxsolch.shop.procurement.app.ProcurementSettings.PREORDER_ANY_PRODUCT;
import static com.maxsolch.shop.procurement.app.ProcurementSettings.PREORDER_HOLD_HOURS;

/**
 * Pre-orders and the waitlist. Two keys of the group are read by procurement (batch holds), so they live there.
 *
 * <p>The keys are the contract with the stored rows and the admin page: they never change. {@code @Order} fixes the
 * place of the group on the settings page.
 */
@Component
@Order(120)
public class PreorderSettings implements SettingsContribution {

    // Pre-orders and the waitlist (V73, preorder.*).
    public static final String PREORDER_GROUP = "preorder";
    public static final String PREORDER_SHOW_WAITING_FROM = "preorder.showWaitingFrom";
    public static final String PREORDER_MAX_ACTIVE = "preorder.maxActive";
    public static final String ANTIBOT_MAX_QTY_PER_PRODUCT = "antibot.maxQtyPerProduct";

    @Override
    public List<SettingGroup> groups() {
        return List.of(
                new SettingGroup(PREORDER_GROUP, "Предзаказы и ожидание",
                        "Очередь на товары, которых нет: поставки, бронь при приезде, что видит покупатель."));
    }

    @Override
    public List<SettingDefinition> definitions() {
        return List.of(
            boolSetting(PREORDER_ANY_PRODUCT, PREORDER_GROUP,
                    "Ожидание на любой отсутствующий товар",
                    "Кнопка «Повідомити, коли з'явиться» на каждом товаре, которого нет, даже без поставки. "
                            + "Кто ждёт — видно в «Поставки → Чего ждут». Выключено — встать в очередь можно "
                            + "только на товары из открытой поставки.",
                    true),
            intSetting(PREORDER_HOLD_HOURS, PREORDER_GROUP,
                    "Бронь при приезде",
                    "Сколько часов товар держится за первым в очереди, когда он приехал. Не купил — бронь "
                            + "переходит следующему. У поставки можно задать своё значение.",
                    24, 1, 168, "ч"),
            intSetting(PREORDER_SHOW_WAITING_FROM, PREORDER_GROUP,
                    "Показывать «Чекають N людей» от",
                    "С какого числа ждущих покупатели видят счётчик на странице товара. 0 — не показывать.",
                    5, 0, 1000, "чел."),
            intSetting(PREORDER_MAX_ACTIVE, PREORDER_GROUP,
                    "Очередей у одного покупателя",
                    "Сколько товаров один покупатель может ждать одновременно. 0 — без ограничения.",
                    20, 0, 500, "шт"));
    }
}
