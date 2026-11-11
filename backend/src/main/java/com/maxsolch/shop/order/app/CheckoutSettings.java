package com.maxsolch.shop.order.app;

import com.maxsolch.shop.settings.app.SettingsContribution;
import com.maxsolch.shop.settings.domain.SettingDefinition;
import com.maxsolch.shop.settings.domain.SettingGroup;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import java.util.List;

import static com.maxsolch.shop.settings.domain.SettingDefinition.boolSetting;
import static com.maxsolch.shop.settings.domain.SettingDefinition.intSetting;

/**
 * «Оплата при отриманні» (Nova Poshta collects the whole sum) and the approve guard. The order reads them at checkout,
 * on approve and in the hold job; payment reads {@link #ON_DELIVERY_ENABLED} / {@link #ON_DELIVERY_MAX_UAH} for the
 * option list. They live in the «payment» group that {@code PaymentSettings} declares.
 *
 * <p>The keys are the contract with the stored rows and the admin page: they never change.
 */
@Component
@Order(21)
public class CheckoutSettings implements SettingsContribution {

    public static final String ON_DELIVERY_ENABLED = "payment.onDeliveryEnabled";
    public static final String ON_DELIVERY_MAX_UAH = "payment.onDeliveryMaxUah";
    public static final String ON_DELIVERY_MAX_OPEN = "payment.onDeliveryMaxOpen";
    public static final String ON_DELIVERY_HOLD_HOURS = "payment.onDeliveryHoldHours";
    public static final String FORBID_APPROVE_UNPAID = "orders.forbidApproveUnpaid";

    private static final String GROUP = "payment";

    @Override
    public List<SettingGroup> groups() {
        return List.of();
    }

    @Override
    public List<SettingDefinition> definitions() {
        return List.of(
            boolSetting(ON_DELIVERY_ENABLED, GROUP,
                    "Оплата при получении (наложенный платёж)",
                    "Покупатель может выбрать «Оплата при получении»: всю сумму собирает Новая почта "
                            + "(«Контроль оплаты»). Сам вариант включается ещё и в «Способах оплаты». "
                            + "Проблемным покупателям не показывается.",
                    false),
            intSetting(ON_DELIVERY_MAX_UAH, GROUP,
                    "Потолок суммы при оплате при получении",
                    "Заказ дороже этой суммы оплачивается только онлайн. 0 — без потолка.",
                    5000, 0, 1_000_000, "₴"),
            intSetting(ON_DELIVERY_MAX_OPEN, GROUP,
                    "Незавершённых заказов «при получении» на человека",
                    "Сколько неоплаченных заказов с оплатой при получении может висеть у одного покупателя "
                            + "одновременно. 0 — без ограничения.",
                    1, 0, 20, null),
            intSetting(ON_DELIVERY_HOLD_HOURS, GROUP,
                    "Отменять неодобренный заказ «при получении» через",
                    "Новый заказ с оплатой при получении, который никто не одобрил за это время, "
                            + "отменяется, товар возвращается на склад. 0 — не отменять.",
                    48, 0, 720, "ч"),
            boolSetting(FORBID_APPROVE_UNPAID, GROUP,
                    "Не одобрять неоплаченные",
                    "Заказ с онлайн-оплатой (или предоплатой) нельзя одобрить, пока деньги не пришли. "
                            + "Заказы с оплатой при получении одобряются сразу.",
                    true));
    }
}
