package com.maxsolch.shop.promo.app;

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
 * The cart and promo-code settings (group «Корзина и промокоды»). The low-margin lists are edited on the gift page but read by the promo codes, so their keys live here.
 *
 * <p>The keys are the contract with the stored rows and the admin page: they never change. {@code @Order} fixes the
 * place of the group on the settings page.
 */
@Component
@Order(10)
public class PromoSettings implements SettingsContribution {

    public static final String PROMO_HOLD_MINUTES = "promo.holdMinutes";
    /** Товары с упором на скидки в кейсе (gift.CaseLowMargin): бренды (slug) и отдельные товары (id). */
    public static final String GIFT_LOW_MARGIN_BRANDS = "gift.lowMarginBrands";
    public static final String GIFT_LOW_MARGIN_PRODUCTS = "gift.lowMarginProducts";

    @Override
    public List<SettingGroup> groups() {
        return List.of(
                new SettingGroup("orders", "Корзина и промокоды", "Как ведут себя корзина и промокоды при оформлении."));
    }

    @Override
    public List<SettingDefinition> definitions() {
        return List.of(
            intSetting(PROMO_HOLD_MINUTES, "orders",
                    "Резерв промокода",
                    "Сколько промокод с ограниченным числом использований держится за покупателем, "
                            + "пока он оформляет заказ. Потом освобождается для других. "
                            + "На сайте в «Доставка и оплата» указано 30 минут — поправьте текст, если меняете.",
                    30, 5, 1440, "мин"));
    }
}
