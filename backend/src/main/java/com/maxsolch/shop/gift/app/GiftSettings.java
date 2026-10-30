package com.maxsolch.shop.gift.app;

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
import static com.maxsolch.shop.promo.app.PromoSettings.GIFT_LOW_MARGIN_BRANDS;
import static com.maxsolch.shop.promo.app.PromoSettings.GIFT_LOW_MARGIN_PRODUCTS;

/**
 * The gift for an order total and the gift cases.
 *
 * <p>The keys are the contract with the stored rows and the admin page: they never change. {@code @Order} fixes the
 * place of the group on the settings page.
 */
@Component
@Order(110)
public class GiftSettings implements SettingsContribution {

    // Gift for the order sum: one product or a gift case (V57, gift.GiftService).
    public static final String GIFT_GROUP = "gift";
    public static final String GIFT_ENABLED = "gift.enabled";
    public static final String GIFT_THRESHOLD_UAH = "gift.thresholdUah";
    public static final String GIFT_PRODUCT_ID = "gift.productId";
    public static final String GIFT_CASE_ENABLED = "gift.caseEnabled";
    public static final String GIFT_PROMO_REMINDER_DAYS = "gift.promoReminderDays";
    /** «Автособрать» кейс (gift.CaseAutofill): средняя наценка и категории призов. */
    public static final String GIFT_MARGIN_PERCENT = "gift.marginPercent";
    public static final String GIFT_CASE_CATEGORIES = "gift.caseCategories";
    public static final String GIFT_CASE_SUPER_CATEGORIES = "gift.caseSuperCategories";
    /** Месячный лимит подарков на человека (gift.GiftRegistryService): 25 % минимальной зарплаты. */
    public static final String GIFT_MONTHLY_LIMIT_UAH = "gift.monthlyLimitUah";

    @Override
    public List<SettingGroup> groups() {
        return List.of(
                new SettingGroup(GIFT_GROUP, "Подарок за сумму (кейсы)",
                        "Подарок или кейс с призом за заказ от порога. Уровни и призы кейсов — в разделе «Кейс»."));
    }

    @Override
    public List<SettingDefinition> definitions() {
        return List.of(
            boolSetting(GIFT_ENABLED, GIFT_GROUP,
                    "Подарок за сумму включён",
                    "Главный выключатель: заказ от порога получает подарок — кейс или товар (цена 0, со "
                            + "склада списывается). В корзине покупатель видит, сколько осталось до подарка.",
                    false),
            boolSetting(GIFT_CASE_ENABLED, GIFT_GROUP,
                    "Подарок — кейсы",
                    "Кейсы трёх уровней (бронзовый, серебряный, золотой) — у каждого свой порог и свои призы "
                            + "(товары и скидки), настраиваются в разделе «Кейс». Покупатель перед оформлением "
                            + "выбирает: гарантированная скидка или крутить кейс. Нет призов — кладётся товар-подарок.",
                    false),
            intSetting(GIFT_THRESHOLD_UAH, GIFT_GROUP,
                    "Порог товара-подарка",
                    "Сумма заказа после скидки, с которой кладётся товар-подарок (без кейсов или когда в кейсе "
                            + "нет призов). Пороги кейсов — у уровней в разделе «Кейс».",
                    3000, 100, 1000000, "₴"),
            textSetting(GIFT_PRODUCT_ID, GIFT_GROUP,
                    "Товар-подарок",
                    "Выбирается в разделе «Кейс». Нет в наличии — подарок не кладётся.",
                    "", 64),
            intSetting(GIFT_PROMO_REMINDER_DAYS, GIFT_GROUP,
                    "Напомнить, что промокод из кейса сгорает, за",
                    "За сколько дней до конца срока бот напомнит о неиспользованном промокоде из кейса "
                            + "(один раз на код). Срок самого промокода — у каждого кейса. 0 — не напоминать.",
                    3, 0, 30, "дн."),
            intSetting(GIFT_MARGIN_PERCENT, GIFT_GROUP,
                    "Средняя маржа товаров",
                    "Для «Автособрать» и сводки кейса: сколько процентов цены — прибыль магазина. "
                            + "Себестоимость приза = цена × (100 − маржа) %.",
                    15, 1, 90, "%"),
            textSetting(GIFT_CASE_CATEGORIES, GIFT_GROUP,
                    "Категории призов кейса",
                    "Корневые категории (slug через запятую), из которых «Автособрать» берёт обычные призы.",
                    "glaydy,kabelya,keykapy,kovriki,rukava", 500),
            textSetting(GIFT_CASE_SUPER_CATEGORIES, GIFT_GROUP,
                    "Категории суперприза",
                    "Корневые категории (slug через запятую) для джекпота золотого кейса.",
                    "klaviatury,myshki", 500),
            textSetting(GIFT_LOW_MARGIN_BRANDS, GIFT_GROUP,
                    "Бренды с упором на скидки",
                    "Бренды (slug через запятую) с маржой около нуля. Заказ с их товаром получает кейс как "
                            + "обычно, но товарные призы выпадают реже (доля — у каждого уровня), а промокоды "
                            + "(любые, не только из кейса) на эти товары не действуют. Настраивается в разделе «Кейс».",
                    "", 1000),
            textSetting(GIFT_LOW_MARGIN_PRODUCTS, GIFT_GROUP,
                    "Товары с упором на скидки",
                    "Отдельные товары (id через запятую) — то же, что бренды выше. Настраивается в разделе «Кейс».",
                    "", 4000),
            intSetting(GIFT_MONTHLY_LIMIT_UAH, GIFT_GROUP,
                    "Лимит подарков на человека в месяц",
                    "Подарки-товары одному человеку (один аккаунт, Telegram или телефон) за календарный месяц "
                            + "не дороже этой суммы по обычной цене: не облагается налогом до 25 % минимальной "
                            + "зарплаты на 1 января (2026 — 2 161,75 ₴). Товар, который вывел бы за лимит, в кейсе "
                            + "не выпадает — выпадает скидка. Менять каждый январь. 0 — без лимита.",
                    2161, 0, 1000000, "₴"));
    }
}
