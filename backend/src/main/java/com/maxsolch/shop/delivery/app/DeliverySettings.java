package com.maxsolch.shop.delivery.app;

import com.maxsolch.shop.settings.app.SettingsContribution;
import com.maxsolch.shop.settings.domain.SettingDefinition;
import com.maxsolch.shop.settings.domain.SettingGroup;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;

import static com.maxsolch.shop.settings.domain.SettingDefinition.boolSetting;
import static com.maxsolch.shop.settings.domain.SettingDefinition.intSetting;
import static com.maxsolch.shop.settings.domain.SettingDefinition.textSetting;

/**
 * Nova Poshta: delivery options at the checkout, waybills, tracking and the directory refresh.
 *
 * <p>The keys are the contract with the stored rows and the admin page: they never change. {@code @Order} fixes the
 * place of the group on the settings page.
 */
@Component
@Order(80)
public class DeliverySettings implements SettingsContribution {

    public static final String NOVAPOSHTA_AUTO_SYNC = "novaposhta.autoSync";
    public static final String NP_AUTO_CREATE_TTN = "novaposhta.autoCreateTtn";
    public static final String NP_SHIP_ON_ACCEPT = "novaposhta.shipOnAccept";
    public static final String NP_TRACKING = "novaposhta.tracking";
    public static final String NP_AUTO_DELIVER = "novaposhta.autoDeliver";
    public static final String NP_NOTIFY_ARRIVAL = "novaposhta.notifyArrival";
    public static final String NP_STORAGE_REMINDER = "novaposhta.storageReminder";
    public static final String NP_ARRIVED_STALE_DAYS = "novaposhta.arrivedStaleDays";
    public static final String NP_CARGO_DESCRIPTION = "novaposhta.cargoDescription";
    public static final String NP_DEFAULT_WEIGHT_G = "novaposhta.defaultWeightG";
    public static final String NP_DEFAULT_LENGTH_MM = "novaposhta.defaultLengthMm";
    public static final String NP_DEFAULT_WIDTH_MM = "novaposhta.defaultWidthMm";
    public static final String NP_DEFAULT_HEIGHT_MM = "novaposhta.defaultHeightMm";
    public static final String NP_BOX_PRESETS = "novaposhta.boxPresets";
    public static final String NP_BOX_FILL_PCT = "novaposhta.boxFillPct";
    public static final String NP_CHECKOUT_ESTIMATE = "novaposhta.checkoutEstimate";
    public static final String NP_COD_FEE_PCT = "novaposhta.codFeePct";
    public static final String NP_COD_FEE_FIXED = "novaposhta.codFeeFixedUah";
    public static final String NP_COURIER_ENABLED = "novaposhta.courierEnabled";
    public static final String NP_POSTOMAT_ENABLED = "novaposhta.postomatEnabled";
    public static final String NP_AUTO_UPDATE_TTN = "novaposhta.autoUpdateTtn";
    public static final String NP_TRACKING_MAX_DAYS = "novaposhta.trackingMaxDays";
    public static final String NP_CREATED_STALE_DAYS = "novaposhta.createdStaleDays";
    public static final String NP_STATUS_OVERRIDES = "novaposhta.statusOverrides";
    public static final String NP_POSTOMAT_MAX_KG = "novaposhta.postomatMaxKg";
    public static final String NP_POSTOMAT_MAX_BOX = "novaposhta.postomatMaxBox";
    public static final String NP_TARIFF_TOLERANCE_PCT = "novaposhta.tariffTolerancePct";
    public static final String NP_DOCUMENTS_ENABLED = "novaposhta.documentsEnabled";
    public static final String NP_DOCUMENTS_CATEGORIES = "novaposhta.documentsCategories";
    public static final String NP_DOCUMENTS_MAX_WEIGHT_G = "novaposhta.documentsMaxWeightG";

    @Override
    public List<SettingGroup> groups() {
        return List.of(
                new SettingGroup("novaposhta", "Новая Почта",
                        "Способы доставки при оформлении, ТТН, отслеживание посылок и справочник отделений. "
                                + "Отправитель (кабинет, отделение отправки) — в блоке «Отправитель Новой почты»."));
    }

    @Override
    public List<SettingDefinition> definitions() {
        List<SettingDefinition> all = new ArrayList<>(checkoutAndTracking());
        all.addAll(parcels());
        all.addAll(limits());
        return all;
    }

    private static List<SettingDefinition> checkoutAndTracking() {
        return List.of(
            boolSetting(NOVAPOSHTA_AUTO_SYNC, "novaposhta",
                    "Обновлять отделения каждую ночь",
                    "Каждую ночь бэкенд подтягивает свежий список отделений и почтоматов. "
                            + "Выключайте, только если API Новой Почты сбоит.",
                    true),
            boolSetting(NP_POSTOMAT_ENABLED, "novaposhta",
                    "Доставка в почтомат",
                    "Покупатель может выбрать почтомат отдельной вкладкой при оформлении. Почтомат не примет "
                            + "посылку тяжелее своего лимита (обычно до 20–30 кг).",
                    true),
            boolSetting(NP_COURIER_ENABLED, "novaposhta",
                    "Курьер на адрес",
                    "Покупатель может выбрать адресную доставку курьером Новой почты (дороже отделения).",
                    true),
            boolSetting(NP_CHECKOUT_ESTIMATE, "novaposhta",
                    "Показывать примерную цену доставки",
                    "При оформлении заказа показывать ориентировочную цену доставки по тарифу Новой почты "
                            + "(платит покупатель при получении).",
                    true),
            intSetting(NP_COD_FEE_PCT, "novaposhta",
                    "Комиссия за перевод наложки — процент",
                    "Сколько Новая почта берёт с покупателя за перевод суммы, которую он платит при получении "
                            + "(«Контроль оплати»): процент от этой суммы плюс фиксированная часть ниже. Входит в "
                            + "«≈ доставку» при оформлении, только если часть заказа платится при получении. "
                            + "На ТТН 24.10.2026: 2 % + 20 ₴.",
                    2, 0, 20, "%"),
            intSetting(NP_COD_FEE_FIXED, "novaposhta",
                    "Комиссия за перевод наложки — фиксированная часть",
                    "Фиксированная часть комиссии «Контроль оплати» в гривнах, добавляется к проценту выше.",
                    20, 0, 500, "₴"),
            boolSetting(NP_AUTO_CREATE_TTN, "novaposhta",
                    "Создавать ТТН при одобрении",
                    "Когда заказ одобрен, ТТН создаётся сама (вес и коробка — из товаров, отделение отправки — "
                            + "основное). Выключено — только кнопкой «Создать ТТН» в заказе или на «К отправке».",
                    false),
            boolSetting(NP_SHIP_ON_ACCEPT, "novaposhta",
                    "«Отправлен» — когда Новая почта приняла посылку",
                    "Заказ становится «Отправлен», когда посылку приняли в отделении (до этого — «ТТН создана»). "
                            + "Выключено — «Отправлен» сразу при создании ТТН.",
                    true),
            boolSetting(NP_TRACKING, "novaposhta",
                    "Отслеживать посылки",
                    "Каждые 30 минут бэкенд спрашивает у Новой почты статусы посылок с ТТН.",
                    true),
            boolSetting(NP_AUTO_DELIVER, "novaposhta",
                    "«Доставлен» — когда покупатель забрал посылку",
                    "Заказ сам становится «Доставлен», когда Новая почта отметит посылку полученной.",
                    true)
        );
    }

    private static List<SettingDefinition> parcels() {
        return List.of(
            boolSetting(NP_NOTIFY_ARRIVAL, "novaposhta",
                    "Сообщать о прибытии посылки",
                    "Бот пишет покупателю, когда посылка прибыла в отделение или почтомат.",
                    true),
            boolSetting(NP_STORAGE_REMINDER, "novaposhta",
                    "Напоминать о платном хранении",
                    "За день до начала платного хранения бот напоминает покупателю забрать посылку.",
                    true),
            intSetting(NP_ARRIVED_STALE_DAYS, "novaposhta",
                    "Посылка лежит в отделении дольше",
                    "Посылка, которую не забрали за это время, появляется на экране «Внимание».",
                    3, 1, 30, "дн"),
            textSetting(NP_CARGO_DESCRIPTION, "novaposhta",
                    "Описание груза в ТТН",
                    "Что написать в ТТН в поле «Опис відправлення».",
                    "Комп'ютерні аксесуари", 100),
            intSetting(NP_DEFAULT_WEIGHT_G, "novaposhta",
                    "Вес по умолчанию",
                    "Вес одной единицы товара с упаковкой, если он не указан ни у товара, ни у его категории.",
                    1000, 10, 30000, "г"),
            intSetting(NP_DEFAULT_LENGTH_MM, "novaposhta",
                    "Коробка по умолчанию: длина",
                    "Габариты упаковки, если они не указаны ни у товара, ни у категории.",
                    300, 10, 3000, "мм"),
            intSetting(NP_DEFAULT_WIDTH_MM, "novaposhta",
                    "Коробка по умолчанию: ширина", "", 200, 10, 3000, "мм"),
            intSetting(NP_DEFAULT_HEIGHT_MM, "novaposhta",
                    "Коробка по умолчанию: высота", "", 100, 10, 3000, "мм"),
            textSetting(NP_BOX_PRESETS, "novaposhta",
                    "Коробки (пресеты)",
                    "По одной на строку: «Название: Д×Ш×В / тара г / упаковка ₴» (мм), например "
                            + "«Коробка 1 кг: 240×170×98 / 100 г / 15 ₴». Тара — вес пустой коробки, упаковка — "
                            + "сколько отделение берёт за коробку (платит покупатель, входит в «≈ доставку»). "
                            + "Из них собирается посылка для ТТН и подсказки цены; не влезло в одну — второе место.",
                    "Пакет НП: 390×290×70 / 50 г / 0 ₴\n"
                            + "Коробка 1 кг: 240×170×98 / 100 г / 15 ₴\n"
                            + "Коробка 2 кг: 340×240×98 / 200 г / 15 ₴\n"
                            + "Плоская 5 кг: 400×240×80 / 300 г / 40 ₴\n"
                            + "Коробка 5 кг: 400×240×200 / 350 г / 40 ₴\n"
                            + "Коробка 10 кг: 400×340×280 / 600 г / 40 ₴", 1000)
        );
    }

    private static List<SettingDefinition> limits() {
        return List.of(
            intSetting(NP_BOX_FILL_PCT, "novaposhta",
                    "Заполнение коробки",
                    "Какую часть объёма коробки занимают товары (остальное — наполнитель и воздух). "
                            + "60 % дали самую точную цену на истории отправок.",
                    60, 30, 100, "%"),
            boolSetting(NP_AUTO_UPDATE_TTN, "novaposhta",
                    "Обновлять ТТН при изменении заказа",
                    "Пока посылку не сдали, ТТН сама меняется, когда в заказе меняются товары, скидка или пришла "
                            + "оплата: наложенный платёж, оценка и вес всегда как в заказе. Не вышло — заказ "
                            + "появится на «Внимание» → «Посылки».",
                    true),
            intSetting(NP_CREATED_STALE_DAYS, "novaposhta",
                    "ТТН создана, но не сдана дольше",
                    "ТТН, по которой посылку так и не сдали в отделение, появляется на экране «Внимание».",
                    2, 1, 30, "дн"),
            intSetting(NP_TRACKING_MAX_DAYS, "novaposhta",
                    "Отслеживать посылку не дольше",
                    "Старше — статус больше не спрашивается, а заказ (если ещё не доставлен) появляется на «Внимание».",
                    60, 7, 365, "дн"),
            textSetting(NP_STATUS_OVERRIDES, "novaposhta",
                    "Свои коды статусов Новой почты",
                    "Если Новая почта ввела новый код статуса (он появится на «Внимание» → «Новая почта: сбои»), "
                            + "его можно привязать сами: по одному на строку «код = стадия», стадии: CREATED, "
                            + "IN_TRANSIT, ARRIVED, RECEIVED, REFUSED, RETURNING, NOT_FOUND, CANCELLED. "
                            + "Пусто — встроенная таблица.",
                    "", 1000),
            intSetting(NP_POSTOMAT_MAX_KG, "novaposhta",
                    "Почтомат: вес, если неизвестен",
                    "Лимит веса берётся из справочника у каждого почтомата; это — запасное значение, если там пусто.",
                    20, 1, 100, "кг"),
            textSetting(NP_POSTOMAT_MAX_BOX, "novaposhta",
                    "Почтомат: коробка, если неизвестна",
                    "Габариты ячейки берутся из справочника у каждого почтомата; это — запасное значение "
                            + "«Д×Ш×В» в мм, если там пусто.",
                    "600×400×300", 40),
            intSetting(NP_TARIFF_TOLERANCE_PCT, "novaposhta",
                    "Расхождение цены доставки",
                    "Если Новая почта посчитала доставку дороже или дешевле нашей оценки больше чем на этот "
                            + "процент (и больше 10 ₴), на «Внимание» появится предупреждение — проверьте вес и коробки.",
                    15, 1, 100, "%"),
            boolSetting(NP_DOCUMENTS_ENABLED, "novaposhta",
                    "Мелочь — тарифом «Документи»",
                    "Заказ только из плоских товаров (коврики, рукава) весом до порога ниже отправляется "
                            + "тарифом «Документи» (дешевле посылки). В окне ТТН можно переключить на посылку.",
                    true),
            textSetting(NP_DOCUMENTS_CATEGORIES, "novaposhta",
                    "«Документи»: категории",
                    "Адреса (slug) категорий через запятую; подкатегории считаются.",
                    "glaydy, rukava", 500),
            intSetting(NP_DOCUMENTS_MAX_WEIGHT_G, "novaposhta",
                    "«Документи»: вес до",
                    "Вместе с упаковкой (конверт). Новая почта принимает «Документи» до 1 кг.",
                    1000, 100, 1000, "г")
        );
    }
}
