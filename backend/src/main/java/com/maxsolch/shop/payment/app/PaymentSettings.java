package com.maxsolch.shop.payment.app;

import com.maxsolch.shop.settings.app.SettingsContribution;
import com.maxsolch.shop.settings.domain.SettingDefinition;
import com.maxsolch.shop.settings.domain.SettingGroup;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.platform.error.PlatformError;

import java.util.List;

import static com.maxsolch.shop.settings.domain.SettingDefinition.boolSetting;
import static com.maxsolch.shop.settings.domain.SettingDefinition.intSetting;
import static com.maxsolch.shop.settings.domain.SettingDefinition.selectSetting;
import static com.maxsolch.shop.settings.domain.SettingDefinition.textSetting;

/**
 * Online payment and fiscal receipt settings.
 *
 * <p>The keys are the contract with the stored rows and the admin page: they never change. {@code @Order} fixes the
 * place of the group on the settings page.
 */
@Component
@Order(20)
public class PaymentSettings implements SettingsContribution {

    /** Tax rate codes of the PRRO (Вчасно.Каса / Checkbox) put on every fiscal receipt line. */
    public static final String PAYMENT_FISCAL_TAX_CODES = "payment.fiscalTaxCodes";
    /** The bot sends the customer each receipt (fiscal check / bank receipt) as a PDF (ReceiptDeliveryJob). */
    public static final String PAYMENT_SEND_RECEIPTS_TO_TELEGRAM = "payment.sendReceiptsToTelegram";

    @Override
    public List<SettingGroup> groups() {
        return List.of(
                new SettingGroup("payment", "Оплата и чеки", "Онлайн-оплата monobank и фискальные чеки (пРРО)."));
    }

    @Override
    public List<SettingDefinition> definitions() {
        return List.of(
            textSetting(PAYMENT_FISCAL_TAX_CODES, "payment",
                    "Коды налоговых ставок для чеков",
                    "Числовые коды ставок из пРРО через запятую (например «1»), ставятся в каждую строку "
                            + "чека monobank. Для Вчасно.Каса обязательно — без кода monobank не создаст "
                            + "счёт. Где взять: Вчасно.Каса → Налаштування → Податкові ставки (для ФОП без "
                            + "ПДВ — ставка «Без ПДВ»). Для Checkbox можно оставить пустым.",
                    "", 64).withCheck(PaymentSettings::taxCodes),
            boolSetting(PAYMENT_SEND_RECEIPTS_TO_TELEGRAM, "payment",
                    "Присылать чеки в Telegram",
                    "Когда пРРО выдаст фискальный чек (продажи или возврата), бот пришлёт его покупателю "
                            + "PDF-файлом со ссылкой на сайт ДПС. Если фискальных чеков нет (пРРО не подключён), "
                            + "через 30 минут после оплаты придёт квитанция банка. Каждый чек — один раз.",
                    true));
    }

    /** Read as numbers by OnlinePaymentService.fiscalTaxCodes(): a word there was dropped silently, and Вчасно.Каса then refuses every invoice without a tax code. */
    private static String taxCodes(String label, String v) {
        if (!v.isEmpty() && !v.matches("\\d+([,;\\s]+\\d+)*")) {
            throw new DomainException.BadRequest(PlatformError.SETTING_BAD_CODE_LIST, label);
        }
        return v;
    }
}
