package com.maxsolch.shop.analytics.app;

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
 * Thresholds of the stock metrics: «мало на складе», «скоро закончится», «мёртвый сток».
 *
 * <p>The keys are the contract with the stored rows and the admin page: they never change. {@code @Order} fixes the
 * place of the group on the settings page.
 */
@Component
@Order(30)
public class StockSettings implements SettingsContribution {

    public static final String CATALOG_LOW_STOCK_QTY = "catalog.lowStockQty";
    public static final String METRICS_LOW_STOCK_DAYS = "metrics.lowStockDays";
    public static final String METRICS_DEAD_STOCK_DAYS = "metrics.deadStockDays";

    @Override
    public List<SettingGroup> groups() {
        return List.of(
                new SettingGroup("stock", "Склад и метрики", "Пороги, по которым товары помечаются «мало» и «не продаются»."));
    }

    @Override
    public List<SettingDefinition> definitions() {
        return List.of(
            intSetting(CATALOG_LOW_STOCK_QTY, "stock",
                    "Порог «мало на складе»",
                    "Товар с остатком не больше этого числа (но больше нуля) помечается «Мало».",
                    3, 0, 1000, "шт"),
            intSetting(METRICS_LOW_STOCK_DAYS, "stock",
                    "«Скоро закончится», если запаса меньше чем на",
                    "В метриках товар попадает в «скоро закончится», если при нынешнем темпе продаж "
                            + "остатка хватит меньше чем на столько дней.",
                    14, 1, 365, "дн."),
            intSetting(METRICS_DEAD_STOCK_DAYS, "stock",
                    "«Мёртвый сток» — без продаж дольше",
                    "Товар в наличии, который не продавался дольше этого срока, считается мёртвым стоком.",
                    60, 7, 730, "дн."));
    }
}
