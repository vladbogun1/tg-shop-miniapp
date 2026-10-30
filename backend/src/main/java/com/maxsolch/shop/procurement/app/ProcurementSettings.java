package com.maxsolch.shop.procurement.app;

import com.maxsolch.shop.settings.app.SettingsContribution;
import com.maxsolch.shop.settings.domain.SettingDefinition;
import com.maxsolch.shop.settings.domain.SettingGroup;
import com.maxsolch.shop.settings.domain.SettingType;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.platform.error.PlatformError;

import java.math.BigDecimal;
import java.util.List;

import static com.maxsolch.shop.settings.domain.SettingDefinition.boolSetting;
import static com.maxsolch.shop.settings.domain.SettingDefinition.intSetting;
import static com.maxsolch.shop.settings.domain.SettingDefinition.selectSetting;
import static com.maxsolch.shop.settings.domain.SettingDefinition.textSetting;

/**
 * Cost of batches and margin; also the two pre-order keys that the batch screens read.
 *
 * <p>The keys are the contract with the stored rows and the admin page: they never change. {@code @Order} fixes the
 * place of the group on the settings page.
 */
@Component
@Order(130)
public class ProcurementSettings implements SettingsContribution {

    // Money of batches and margin (V74, costing.*).
    public static final String COSTING_GROUP = "costing";
    /** Bank fee in percent, a decimal as text ({@code 1.3}); used where monobank sent no fee of its own. */
    public static final String COSTING_ACQUIRING_FEE_PERCENT = "costing.acquiringFeePercent";
    /** How a new batch spreads its expenses: BY_VALUE | BY_QTY | BY_WEIGHT | MANUAL. */
    public static final String COSTING_DEFAULT_DISTRIBUTION = "costing.defaultDistribution";
    public static final String PREORDER_ANY_PRODUCT = "preorder.anyProduct";
    public static final String PREORDER_HOLD_HOURS = "preorder.holdHours";

    @Override
    public List<SettingGroup> groups() {
        return List.of(
                new SettingGroup(COSTING_GROUP, "Себестоимость и маржа",
                        "Расчёт себестоимости поставок и маржи заказов (раздел «Финансы»)."));
    }

    @Override
    public List<SettingDefinition> definitions() {
        return List.of(
            new SettingDefinition(COSTING_ACQUIRING_FEE_PERCENT, COSTING_GROUP, SettingType.STRING,
                    "Комиссия эквайринга",
                    "Сколько банк берёт с онлайн-оплаты, в процентах (например 1.3). Нужна только для оценки "
                            + "маржи там, где monobank не прислал свою сумму комиссии. От 0 до 10.",
                    "1.3", null, null, 8, "%").withCheck(ProcurementSettings::feePercent),
            selectSetting(COSTING_DEFAULT_DISTRIBUTION, COSTING_GROUP,
                    "Распределение расходов по умолчанию",
                    "Как новая поставка делит расходы (фрахт, таможня) между позициями: по "
                            + "стоимости закупки, по штукам, по весу или вручную. "
                            + "У каждой поставки можно выбрать своё.",
                    "BY_VALUE", java.util.List.of(
                            new SettingDefinition.Option("BY_VALUE", "По стоимости"),
                            new SettingDefinition.Option("BY_QTY", "По штукам"),
                            new SettingDefinition.Option("BY_WEIGHT", "По весу"),
                            new SettingDefinition.Option("MANUAL", "Вручную"))));
    }

    /** A percent from 0 to 10 with a dot or comma; stored with a dot, without trailing noise. */
    private static String feePercent(String label, String v) {
        try {
            BigDecimal d = new BigDecimal(v.replace(',', '.'));
            if (d.signum() < 0 || d.compareTo(BigDecimal.TEN) > 0) {
                throw new DomainException.BadRequest(PlatformError.SETTING_ZERO_TO_TEN, label);
            }
            return d.stripTrailingZeros().toPlainString();
        } catch (NumberFormatException e) {
            throw new DomainException.BadRequest(PlatformError.SETTING_NOT_DECIMAL, label);
        }
    }
}
